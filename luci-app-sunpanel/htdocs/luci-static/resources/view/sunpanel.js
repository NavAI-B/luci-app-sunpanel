'use strict';
'require view';
'require fs';
'require ui';
'require rpc';
'require uci';
'require poll';
'require dom';

var callGetInitList = rpc.declare({
	object: 'luci',
	method: 'getInitList',
	params: [ 'name' ],
	expect: { '': {} }
});

var callSetInit = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

var DISPATCH = '/usr/libexec/sunpanel-call';

function disp(action, args) {
	return fs.exec_direct(DISPATCH, [ action ].concat(args || []), 'json')
		.then(L.bind(function(res) {
			if (!res || res.ok === false)
				return Promise.reject((res && res.error) ? res.error : _('调度器调用失败'));
			return res;
		}, this));
}

function fmtSize(sz) {
	if (sz == null)
		return '-';
	if (sz > 1048576)
		return '%.1f MB'.format(sz / 1048576);
	if (sz > 1024)
		return '%.1f KB'.format(sz / 1024);
	return '%d B'.format(sz);
}

function phaseText(phase) {
	var map = {
		download: _('正在下载'),
		verify: _('正在校验 SHA256'),
		extract: _('正在解包'),
		switch: _('正在切换版本'),
		done: _('完成'),
		failed: _('失败'),
		deploying: _('正在部署 v2 试运行实例'),
		deployed: _('v2 试运行中，请在 v2 界面导入备份'),
		'verified': _('试运行验证通过'),
		switched: _('v2 已切换为正式实例'),
		'deploy-failed': _('部署失败'),
		'verify-failed': _('验证失败'),
		'switch-failed': _('切换失败'),
		aborted: _('已中止，v1 已恢复服务'),
		'done-mig': _('迁移完成')
	};
	return map[phase] || phase || '-';
}

function badge(text, cls) {
	return E('span', { 'class': 'label ' + (cls || 'label-info'), 'style': 'margin-left:.4em' }, [ text ]);
}

function kvTable(rows) {
	var tbl = E('table', { 'class': 'table' });
	for (var i = 0; i < rows.length; i++) {
		tbl.appendChild(E('tr', {}, [
			E('td', { 'style': 'width:33%' }, [ rows[i][0] ]),
			E('td', {}, [ rows[i][1] ])
		]));
	}
	return tbl;
}

return view.extend({
	_jobActive: false,
	_migratePolling: false,

	load: function() {
		return Promise.all([
			disp('info'),
			disp('migrate', [ 'status' ]),
			uci.load('sunpanel')
		]);
	},

	render: function(data) {
		var self = this;
		var info = data[0];
		var migState = data[1].state;

		var container = E('div', { 'class': 'cbi-map' });

		/* ---------- tabs ---------- */
		var tabStatus = E('div', { 'data-tab': 'status', 'data-tab-title': _('服务状态') });
		var tabSettings = E('div', { 'data-tab': 'settings', 'data-tab-title': _('基础设置') });
		var tabVersion = E('div', { 'data-tab': 'version', 'data-tab-title': _('版本管理') });
		var tabMigrate = E('div', { 'data-tab': 'migrate', 'data-tab-title': _('v1 迁移向导') });
		var tabs = E('div', {}, [ tabStatus, tabSettings, tabVersion, tabMigrate ]);
		container.appendChild(tabs);

		/* ================= status tab ================= */
		var statusBox = E('div', {}, E('em', {}, _('加载中…')));
		tabStatus.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('运行状态') ]),
			statusBox
		]));

		var logBox = E('pre', { 'class': 'ucli', 'style': 'max-height:300px; overflow:auto' }, [ _('（空）') ]);
		var logBtn = E('button', {
			'class': 'btn cbi-button',
			'click': ui.createHandlerFn(this, function() {
				return disp('logs', [ 'service', '60' ]).then(function(res) {
					logBox.textContent = res.log || _('（空）');
				}).catch(function(e) { ui.addNotification(null, E('p', {}, [ e ])); });
			})
		}, [ _('刷新服务日志') ]);
		tabStatus.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('服务日志') ]),
			logBtn,
			E('div', { 'style': 'margin-top:.5em' }, [ logBox ])
		]));

		this.renderStatusBox(statusBox, info);

		/* ================= settings tab ================= */
		tabSettings.appendChild(this.buildSettings());

		/* ================= version tab ================= */
		var versionBox = E('div', {});
		tabVersion.appendChild(versionBox);
		this.renderVersionTab(versionBox, info);

		/* ================= migrate tab ================= */
		var migrateBox = E('div', {});
		tabMigrate.appendChild(E('div', { 'class': 'alert alert-info' }, [
			E('p', {}, [ _('迁移按官方推荐路线执行：v1 导出备份包 → 全新部署 v2 试运行 → 在 v2 界面导入备份 → 确认无误后切换正式端口。整个过程中 v1 的数据目录只读不动。') ])
		]));
		tabMigrate.appendChild(migrateBox);
		this.renderMigrateTab(migrateBox, info, migState);

		requestAnimationFrame(function() { ui.tabs.initTabElements(container); });

		/* ---------- polling ---------- */
		poll.add(L.bind(function() {
			return disp('info').then(function(inf) {
				self.renderStatusBox(statusBox, inf);
			}).catch(function() {});
		}, this), 5);

		poll.add(L.bind(function() {
			if (!self._jobActive && !self._migratePolling)
				return Promise.resolve();
			return Promise.all([
				disp('update-status'),
				disp('migrate', [ 'status' ])
			]).then(function(res) {
				self.renderUpdateStatus(versionBox, res[0].state);
				if (self._migratePolling)
					self.renderMigrateTab(migrateBox, res[0], res[1].state);
			}).catch(function() {});
		}, this), 3);

		return container;
	},

	renderStatusBox: function(box, info) {
		var modeText = {
			v2: _('v2 正式运行'),
			legacy: _('v1 兼容模式（等待迁移）'),
			'legacy-forced': _('v1 强制模式（应急回退）'),
			none: _('未安装')
		};
		var openLink = E('a', {
			'href': 'http://' + window.location.hostname + ':' + info.port + '/',
			'target': '_blank',
			'class': 'btn cbi-button cbi-button-action',
			'style': 'margin-left:.5em'
		}, [ _('打开面板') ]);

		var rows = [
			[ _('运行状态'), (info.running ? badge(_('运行中'), 'label-success') : badge(_('已停止'), 'label-danger')) ],
			[ _('运行模式'), modeText[info.mode] || info.mode ],
			[ _('已安装版本'), info.installed_version || '-' ],
			[ _('监听端口'), info.port ],
			[ _('开机自启'), info.service_enabled ? _('是') : _('否') ],
			[ _('程序目录'), info.app_dir ],
			[ _('数据目录'), info.data_dir ],
			[ '', openLink ]
		];
		box.innerHTML = '';
		box.appendChild(kvTable(rows));
	},

	buildSettings: function() {
		var m, s, o;

		m = new form.Map('sunpanel', _('Sun-Panel 基础配置'));

		s = m.section(form.NamedSection, 'sunpanel', 'sunpanel', _('全局设置'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('启用服务'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Value, 'port', _('HTTP 端口'));
		o.datatype = 'port';
		o.rmempty = false;

		o = s.option(form.Value, 'https_port', _('HTTPS 端口'));
		o.datatype = 'port';

		o = s.option(form.Value, 'listen', _('监听地址'));
		o.datatype = 'ipaddr';
		o.placeholder = '0.0.0.0';

		o = s.option(form.Value, 'token_expires', _('Token 有效期（小时）'));
		o.datatype = 'uinteger';

		o = s.option(form.Value, 'data_dir', _('数据目录'));
		o.rmempty = false;
		o.description = _('包含 conf / database / uploads / runtime / custom / micro_app，建议放在大容量分区');

		o = s.option(form.Value, 'app_dir', _('程序目录'));
		o.rmempty = false;
		o.description = _('sun-panel 主程序与 web 前端所在目录，由版本管理功能维护');

		o = s.option(form.Flag, 'manage_conf', _('由 LuCI 管理 conf.ini'));
		o.default = o.enabled;
		o.description = _('开启后每次启动按上方配置重新生成 conf/conf.ini；关闭则仅首次生成，保留手工修改');

		o = s.option(form.ListValue, 'channel', _('更新通道'));
		o.value('stable', _('稳定版（正式 release）'));
		o.value('beta', _('测试版（v2 beta 预发布）'));
		o.description = _('当前 v2 正式版尚未发布，跟随 v2 需选择测试版通道');

		o = s.option(form.Value, 'mirror', _('GitHub 加速前缀'));
		o.placeholder = _('留空直连，例如 https://ghfast.top');
		o.description = _('下载 release 资产失败时可配置加速站前缀');

		o = s.option(form.Value, 'proxy', _('下载代理'));
		o.placeholder = _('留空不使用，例如 http://127.0.0.1:7890');

		o = s.option(form.DummyValue, '_applyhint', ' ');
		o.cfgvalue = function() {
			return E('em', {}, _('保存并应用后，若修改了端口等参数需重启服务才能生效。'));
		};

		var self = this;
		return m.render().then(function(mapNode) {
			var wrap = E('div', {}, [
				mapNode,
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-negative',
						'click': ui.createHandlerFn(self, function(ev) {
							return self.restartService(ev);
						})
					}, [ _('重启服务') ])
				])
			]);
			return wrap;
		});
	},

	restartService: function(ev) {
		return fs.exec_direct(DISPATCH, [ 'conf-render' ], 'json').then(function(res) {
			if (!res.ok)
				throw (res.error || _('conf.ini 渲染失败'));
			return callSetInit('sunpanel', 'restart');
		}).then(function() {
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('配置已渲染，服务已重启') ]), 4000);
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, [ _('操作失败：%s').format(e) ]));
		});
	},

	renderVersionTab: function(box, info) {
		var self = this;
		var checkResult = E('div', {});
		var progress = E('div', {});
		var localReleases = E('div', {});

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('检查更新') ]),
			E('p', {}, [
				_('当前版本：%s').format(info.installed_version || _('未安装')),
				' ',
				_('架构：%s').format(info.arch),
				' ',
				_('通道：%s').format(info.channel == 'beta' ? _('测试版') : _('稳定版'))
			]),
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(self, function(ev) {
					ev.target.disabled = true;
					checkResult.innerHTML = '';
					return disp('check-update').then(function(res) {
						self.showCheckResult(checkResult, res);
					}).catch(function(e) {
						ui.addNotification(null, E('p', {}, [ _('检查失败：%s').format(e) ]));
					}).finally(function() {
						ev.target.disabled = false;
					});
				})
			}, [ _('检查 GitHub 最新版本') ]),
			E('div', { 'style': 'margin-top:.8em' }, [ checkResult ])
		]));

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('离线安装') ]),
			E('p', {}, [ _('从本地上传官方 release 压缩包（sun-panel_vX_linux_arm64.tar.gz），适合无法直连 GitHub 的环境。') ]),
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(self, function(ev) {
					return self.uploadAndInstall(ev);
				})
			}, [ _('上传并安装 release 包') ])
		]));

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('更新进度') ]),
			progress
		]));

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('本地保留的版本') ]),
			localReleases
		]));

		this.renderLocalReleases(localReleases, info);
		this.renderUpdateStatus(progress, null);
	},

	showCheckResult: function(box, res) {
		var self = this;
		box.innerHTML = '';

		var cards = [ res.stable, res.beta ];
		var titles = [ _('稳定通道'), _('测试通道（beta）') ];

		for (var i = 0; i < cards.length; i++) {
			var r = cards[i];
			if (!r) {
				box.appendChild(E('p', {}, [ '%s：%s'.format(titles[i], _('没有可用版本')) ]));
				continue;
			}
			var isCurrent = (r.tag == res.current);
			var btn = E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'disabled': isCurrent ? 'disabled' : null,
				'click': ui.createHandlerFn(self, function(tag, url, sha, ev) {
					self.confirmInstall(tag, url, sha);
				}, r.tag, r.url, r.sha256)
			}, [ isCurrent ? _('当前版本') : _('安装此版本') ]);

			box.appendChild(E('div', { 'class': 'cbi-section', 'style': 'border:1px solid var(--border-color); border-radius:4px; padding:.6em; margin-bottom:.6em' }, [
				E('p', {}, [
					E('strong', {}, [ r.tag ]),
					' ',
					r.prerelease ? badge(_('预发布'), 'label-warning') : badge(_('正式版'), 'label-success'),
					' ',
					isCurrent ? badge(_('已安装'), 'label-info') : E('span', {}, [ '' ])
				]),
				E('p', {}, [
					_('发布时间：%s　大小：%s').format((r.date || '-').slice(0, 10), fmtSize(r.size))
				]),
				btn
			]));
		}
	},

	confirmInstall: function(tag, url, sha) {
		var self = this;
		ui.showModal(_('安装 Sun-Panel %s').format(tag), [
			E('p', {}, [ _('安装过程会自动备份当前版本，若新版本启动异常会自动回滚。') ]),
			E('p', {}, [ _('服务将短暂中断，确认继续？') ]),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, [ _('取消') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-important',
					'click': ui.createHandlerFn(self, function() {
						ui.hideModal();
						return self.startUpdate(tag, url, sha);
					})
				}, [ _('确认安装') ])
			])
		]);
	},

	startUpdate: function(tag, url, sha) {
		var self = this;
		self._jobActive = true;
		return disp('update-start', [ tag, url, sha || '-' ]).then(function() {
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('更新任务已启动，请关注下方进度') ]), 4000);
		}).catch(function(e) {
			self._jobActive = false;
			ui.addNotification(null, E('p', {}, [ _('启动更新失败：%s').format(e) ]));
		});
	},

	uploadAndInstall: function(ev) {
		var self = this;
		return ui.uploadFile('/tmp/sunpanel-upload/release.tar.gz').then(function(res) {
			self._jobActive = true;
			return disp('release-import', [ '/tmp/sunpanel-upload/release.tar.gz' ]);
		}).then(function() {
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('离线安装任务已启动') ]), 4000);
		}).catch(function(e) {
			self._jobActive = false;
			ui.addNotification(null, E('p', {}, [ _('上传或安装失败：%s').format(e) ]));
		});
	},

	renderUpdateStatus: function(box, st) {
		if (st == null || st.phase == null || st.phase == '') {
			box.innerHTML = '';
			box.appendChild(E('em', {}, [ _('暂无更新任务') ]));
			return;
		}
		if (st.phase == 'done' || st.phase == 'failed')
			this._jobActive = false;

		var cls = (st.phase == 'failed') ? 'alert-danger' : (st.phase == 'done' ? 'alert-success' : 'alert-info');
		box.innerHTML = '';
		box.appendChild(E('div', { 'class': 'alert ' + cls }, [
			E('p', {}, [
				E('strong', {}, [ '%s：%s'.format(_('状态'), phaseText(st.phase)) ]),
				st.version ? '　' + _('版本：%s').format(st.version) : E('span', {}, [ '' ])
			]),
			st.message ? E('p', {}, [ st.message ]) : E('span', {}, [ '' ]),
			E('pre', { 'style': 'max-height:200px; overflow:auto; margin:.4em 0 0 0' }, [ st.log || _('（暂无日志）') ])
		]));
	},

	renderLocalReleases: function(box, info) {
		var self = this;
		box.innerHTML = '';
		var rels = info.releases || [];
		if (rels.length == 0) {
			box.appendChild(E('em', {}, [ _('暂无历史版本') ]));
			return;
		}
		rels.sort(function(a, b) { return (b.mtime || 0) - (a.mtime || 0); });
		var rows = [];
		for (var i = 0; i < rels.length; i++) {
			var r = rels[i];
			var isCur = (r.version == info.installed_version);
			rows.push(E('tr', {}, [
				E('td', {}, [ r.version, isCur ? badge(_('当前'), 'label-success') : E('span', {}, [ '' ]) ]),
				E('td', {}, [ fmtSize(r.size) ]),
				E('td', {}, [
					!isCur ? E('button', {
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(self, function(v, ev) {
							self.confirmRollback(v);
						}, r.version)
					}, [ _('回滚到此版本') ]) : E('span', {}, [ '-' ]),
					' ',
					!isCur ? E('button', {
						'class': 'btn cbi-button cbi-button-negative',
						'click': ui.createHandlerFn(self, function(v, ev) {
							return disp('release-delete', [ v ]).then(function() {
								return disp('info');
							}).then(function(inf) {
								self.renderLocalReleases(box, inf);
							});
						}, r.version)
					}, [ _('删除') ]) : E('span', {}, [ '' ])
				])
			]));
		}
		box.appendChild(E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', {}, [ _('版本') ]),
				E('th', {}, [ _('大小') ]),
				E('th', {}, [ _('操作') ])
			])
		].concat(rows)));
	},

	confirmRollback: function(ver) {
		var self = this;
		ui.showModal(_('回滚到 %s').format(ver), [
			E('p', {}, [ _('当前版本会被保留为历史版本，服务将重启并切换到 %s。').format(ver) ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('取消') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-important',
					'click': ui.createHandlerFn(self, function() {
						ui.hideModal();
						self._jobActive = true;
						return disp('rollback', [ ver ]).then(function() {
							ui.addTimeLimitedNotification(null, E('p', {}, [ _('回滚任务已启动') ]), 4000);
						}).catch(function(e) {
							self._jobActive = false;
							ui.addNotification(null, E('p', {}, [ _('回滚失败：%s').format(e) ]));
						});
					})
				}, [ _('确认回滚') ])
			])
		]);
	},

	renderMigrateTab: function(box, info, st) {
		var self = this;
		box.innerHTML = '';
		var stage = st ? (st.stage || '') : '';

		/* step indicator */
		var steps = [
			[ '', _('检测 v1') ],
			[ 'backup', _('上传备份包') ],
			[ 'deployed', _('部署 v2 试运行') ],
			[ 'verified', _('导入并验证') ],
			[ 'switched', _('切换正式端口') ],
			[ 'done', _('完成清理') ]
		];
		var stageOrder = { '': 0, backup: 1, deployed: 2, verified: 3, switched: 4, done: 5 };
		var cur = stageOrder[stage] != null ? stageOrder[stage] : 0;
		var stepLine = E('p', {});
		for (var i = 0; i < steps.length; i++) {
			var done = i < cur;
			var active = i == cur;
			stepLine.appendChild(E('span', {
				'style': 'margin-right:1em; ' + (done ? 'color:#2e7d32;' : (active ? 'font-weight:bold;' : 'color:#888;'))
			}, [ (done ? '✔ ' : (active ? '▶ ' : '')) + steps[i][1] ]));
		}
		box.appendChild(stepLine);

		if (stage && stage != '' && st.message)
			box.appendChild(E('div', { 'class': 'alert alert-info' }, [ st.message ]));

		/* wizard buttons */
		var bDetect = E('button', {
			'class': 'btn cbi-button',
			'click': ui.createHandlerFn(self, function(ev) {
				return disp('migrate', [ 'detect' ]).then(function(res) {
					self._migrateDetect = res.detect;
					self.renderMigrateTab(box, info, st);
				});
			})
		}, [ _('检测旧版 v1') ]);

		var bUpload = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function(ev) {
				return ui.uploadFile('/tmp/sunpanel-upload/backup.zip').then(function() {
					return disp('migrate', [ 'store-backup', '/tmp/sunpanel-upload/backup.zip' ]);
				}).then(function() {
					self._migratePolling = false;
					return disp('migrate', [ 'detect' ]).then(function(res) {
						self._migrateDetect = res.detect;
						self.renderMigrateTab(box, info, st);
					});
				}).catch(function(e) {
					ui.addNotification(null, E('p', {}, [ _('上传失败：%s').format(e) ]));
				});
			})
		}, [ _('上传 v1 备份包 (zip)') ]);

		var bDeploy = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'deploy' ]).then(function() {
					ui.addTimeLimitedNotification(null, E('p', {}, [ _('部署任务已启动') ]), 4000);
				}).catch(function(e) {
					self._migratePolling = false;
					ui.addNotification(null, E('p', {}, [ _('部署失败：%s').format(e) ]));
				});
			})
		}, [ _('部署 v2 试运行（端口 3004）') ]);

		var bVerify = E('button', {
			'class': 'btn cbi-button',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'verify' ]);
			})
		}, [ _('验证试运行实例') ]);

		var bSwitch = E('button', {
			'class': 'btn cbi-button cbi-button-important',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'switch' ]).then(function() {
					ui.addTimeLimitedNotification(null, E('p', {}, [ _('切换任务已启动') ]), 4000);
				}).catch(function(e) {
					ui.addNotification(null, E('p', {}, [ _('切换失败：%s').format(e) ]));
				});
			})
		}, [ _('切换到正式端口') ]);

		var bFinish = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'finish' ]);
			})
		}, [ _('完成清理（归档 v1）') ]);

		var bAbort = E('button', {
			'class': 'btn cbi-button cbi-button-negative',
			'click': ui.createHandlerFn(self, function(ev) {
				return disp('migrate', [ 'abort' ]).then(function() {
					self._migratePolling = true;
				});
			})
		}, [ _('中止并恢复 v1 服务') ]);

		var row = E('div', { 'style': 'display:flex; flex-wrap:wrap; gap:.5em' });

		/* context-driven button set */
		var det = this._migrateDetect;
		var v2installed = (info.mode == 'v2');

		if (stage == '' || stage == 'aborted') {
			row.appendChild(bDetect);
			if (det && det.found == '1') {
				row.appendChild(bUpload);
				if (det.backup_ready == '1' && v2installed)
					row.appendChild(bDeploy);
			}
		}
		else if (stage == 'deploying') {
			row.appendChild(E('em', {}, [ _('部署中，请稍候…') ]));
		}
		else if (stage == 'deployed' || stage == 'verify-failed') {
			row.appendChild(bVerify);
			row.appendChild(bAbort);
		}
		else if (stage == 'verified') {
			row.appendChild(bSwitch);
			row.appendChild(bAbort);
		}
		else if (stage == 'switched') {
			row.appendChild(bFinish);
		}
		else if (stage == 'done') {
			box.appendChild(E('div', { 'class': 'alert alert-success' }, [ _('迁移已完成。旧版 v1 已归档，可在版本管理中查看。') ]));
			box.appendChild(row);
			return;
		}
		else if (stage.indexOf('failed') >= 0) {
			row.appendChild(bAbort);
		}

		box.appendChild(row);

		/* v1 detail box */
		if (det && det.found == '1') {
			box.appendChild(E('div', { 'class': 'cbi-section', 'style': 'margin-top:1em' }, [
				E('div', { 'class': 'cbi-section-title' }, [ _('检测到的旧版 v1') ]),
				kvTable([
					[ _('版本'), det.version || 'unknown' ],
					[ _('数据目录'), det.dir ],
					[ _('端口'), det.port ],
					[ _('运行中'), det.running == '1' ? _('是') : _('否') ],
					[ _('备份包'), det.backup_ready == '1' ? _('已上传') : _('未上传') ]
				])
			]));
		}

		/* import guidance */
		if (stage == 'deployed') {
			box.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('p', {}, [
					_('请打开'),
					' ',
					E('a', { 'href': 'http://' + window.location.hostname + ':3004/', 'target': '_blank' }, [ 'http://' + window.location.hostname + ':3004/' ]),
					_('，使用默认账号 admin@sun.cc / 12345678 登录全新 v2，然后进入「系统设置 → 备份恢复」，导入刚上传的 v1 备份包。导入完成并确认内容无误后，回到本页点击「验证试运行实例」。')
				])
			]));
		}

		/* emergency controls */
		box.appendChild(E('div', { 'class': 'cbi-section', 'style': 'margin-top:1.5em' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('应急操作') ]),
			E('p', {}, [ _('若 v2 出现问题需要临时回到 v1（仅当 v1 尚未被清理时可用）：') ]),
			E('button', {
				'class': 'btn cbi-button cbi-button-negative',
				'click': ui.createHandlerFn(self, function(ev) {
					return disp('legacy-force', [ 'on' ]).then(function() {
						ui.addTimeLimitedNotification(null, E('p', {}, [ _('已切换到 v1 兼容模式') ]), 4000);
					}).catch(function(e) {
						ui.addNotification(null, E('p', {}, [ _('操作失败：%s').format(e) ]));
					});
				})
			}, [ _('强制回到 v1') ]),
			' ',
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(self, function(ev) {
					return disp('legacy-force', [ 'off' ]).then(function() {
						ui.addTimeLimitedNotification(null, E('p', {}, [ _('已取消 v1 强制模式') ]), 4000);
					});
				})
			}, [ _('取消 v1 强制模式') ])
		]));
	}
});
