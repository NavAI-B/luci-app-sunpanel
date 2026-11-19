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
				return Promise.reject((res && res.error) ? res.error : _('Dispatcher call failed'));
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
		download: _('Downloading'),
		verify: _('Verifying SHA256'),
		extract: _('Extracting'),
		switch: _('Switching version'),
		done: _('Done'),
		failed: _('Failed'),
		deploying: _('Deploying v2 test instance'),
		deployed: _('v2 test instance running, import the backup in the v2 UI now'),
		'verified': _('Test instance verified'),
		switched: _('v2 switched to the primary instance'),
		'deploy-failed': _('Deployment failed'),
		'verify-failed': _('Verification failed'),
		'switch-failed': _('Switch failed'),
		aborted: _('Aborted, v1 is serving again'),
		'done-mig': _('Migration complete')
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
		var tabStatus = E('div', { 'data-tab': 'status', 'data-tab-title': _('Service status') });
		var tabSettings = E('div', { 'data-tab': 'settings', 'data-tab-title': _('Basic settings') });
		var tabVersion = E('div', { 'data-tab': 'version', 'data-tab-title': _('Version manager') });
		var tabMigrate = E('div', { 'data-tab': 'migrate', 'data-tab-title': _('v1 migration wizard') });
		var tabs = E('div', {}, [ tabStatus, tabSettings, tabVersion, tabMigrate ]);
		container.appendChild(tabs);

		/* ================= status tab ================= */
		var statusBox = E('div', {}, E('em', {}, _('Loading…')));
		tabStatus.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Status') ]),
			statusBox
		]));

		var logBox = E('pre', { 'class': 'ucli', 'style': 'max-height:300px; overflow:auto' }, [ _('(empty)') ]);
		var logBtn = E('button', {
			'class': 'btn cbi-button',
			'click': ui.createHandlerFn(this, function() {
				return disp('logs', [ 'service', '60' ]).then(function(res) {
					logBox.textContent = res.log || _('(empty)');
				}).catch(function(e) { ui.addNotification(null, E('p', {}, [ e ])); });
			})
		}, [ _('Refresh service log') ]);
		tabStatus.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Service log') ]),
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
			E('p', {}, [ _('Migration follows the officially recommended path: export a v1 backup, deploy a fresh v2 test instance, import the backup in the v2 UI, then switch to the production port after verification. The v1 data directory stays read-only throughout.') ])
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
			v2: _('v2 running'),
			legacy: _('v1 compat mode (pending migration)'),
			'legacy-forced': _('v1 forced mode (emergency fallback)'),
			none: _('Not installed')
		};
		var openLink = E('a', {
			'href': 'http://' + window.location.hostname + ':' + info.port + '/',
			'target': '_blank',
			'class': 'btn cbi-button cbi-button-action',
			'style': 'margin-left:.5em'
		}, [ _('Open panel') ]);

		var rows = [
			[ _('Status'), (info.running ? badge(_('Running'), 'label-success') : badge(_('Stopped'), 'label-danger')) ],
			[ _('Mode'), modeText[info.mode] || info.mode ],
			[ _('Installed version'), info.installed_version || '-' ],
			[ _('Listen port'), info.port ],
			[ _('Autostart'), info.service_enabled ? _('Yes') : _('No') ],
			[ _('Program directory'), info.app_dir ],
			[ _('Data directory'), info.data_dir ],
			[ '', openLink ]
		];
		box.innerHTML = '';
		box.appendChild(kvTable(rows));
	},

	buildSettings: function() {
		var m, s, o;

		m = new form.Map('sunpanel', _('Sun-Panel basic configuration'));

		s = m.section(form.NamedSection, 'sunpanel', 'sunpanel', _('Global settings'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable service'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Value, 'port', _('HTTP port'));
		o.datatype = 'port';
		o.rmempty = false;

		o = s.option(form.Value, 'https_port', _('HTTPS port'));
		o.datatype = 'port';

		o = s.option(form.Value, 'listen', _('Listen address'));
		o.datatype = 'ipaddr';
		o.placeholder = '0.0.0.0';

		o = s.option(form.Value, 'token_expires', _('Token lifetime (hours)'));
		o.datatype = 'uinteger';

		o = s.option(form.Value, 'data_dir', _('Data directory'));
		o.rmempty = false;
		o.description = _('Contains conf / database / uploads / runtime / custom / micro_app; keep it on a large partition');

		o = s.option(form.Value, 'app_dir', _('Program directory'));
		o.rmempty = false;
		o.description = _('Directory holding the sun-panel binary and web assets, managed by the version manager');

		o = s.option(form.Flag, 'manage_conf', _('Manage conf.ini from LuCI'));
		o.default = o.enabled;
		o.description = _('When enabled, conf/conf.ini is regenerated from these options at every service start; when disabled it is only created once and manual edits survive');

		o = s.option(form.ListValue, 'channel', _('Update channel'));
		o.value('stable', _('Stable (official releases)'));
		o.value('beta', _('Beta (v2 pre-releases)'));
		o.description = _('No stable v2 release exists yet; choose beta to follow v2');

		o = s.option(form.Value, 'mirror', _('GitHub mirror prefix'));
		o.placeholder = _('Empty for direct connection, e.g. https://ghfast.top');
		o.description = _('Configure a mirror prefix when release downloads fail');

		o = s.option(form.Value, 'proxy', _('Download proxy'));
		o.placeholder = _('Empty to disable, e.g. http://127.0.0.1:7890');

		o = s.option(form.DummyValue, '_applyhint', ' ');
		o.cfgvalue = function() {
			return E('em', {}, _('After Save & Apply a service restart is required for port changes to take effect.'));
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
					}, [ _('Restart service') ])
				])
			]);
			return wrap;
		});
	},

	restartService: function(ev) {
		return fs.exec_direct(DISPATCH, [ 'conf-render' ], 'json').then(function(res) {
			if (!res.ok)
				throw (res.error || _('conf.ini rendering failed'));
			return callSetInit('sunpanel', 'restart');
		}).then(function() {
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('Configuration rendered, service restarted') ]), 4000);
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, [ _('Operation failed: %s').format(e) ]));
		});
	},

	renderVersionTab: function(box, info) {
		var self = this;
		var checkResult = E('div', {});
		var progress = E('div', {});
		var localReleases = E('div', {});

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Check for updates') ]),
			E('p', {}, [
				_('Current version: %s').format(info.installed_version || _('Not installed')),
				' ',
				_('Architecture: %s').format(info.arch),
				' ',
				_('Channel: %s').format(info.channel == 'beta' ? _('Beta') : _('Stable'))
			]),
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(self, function(ev) {
					ev.target.disabled = true;
					checkResult.innerHTML = '';
					return disp('check-update').then(function(res) {
						self.showCheckResult(checkResult, res);
					}).catch(function(e) {
						ui.addNotification(null, E('p', {}, [ _('Check failed: %s').format(e) ]));
					}).finally(function() {
						ev.target.disabled = false;
					});
				})
			}, [ _('Check latest GitHub releases') ]),
			E('div', { 'style': 'margin-top:.8em' }, [ checkResult ])
		]));

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Offline install') ]),
			E('p', {}, [ _('Upload an official release tarball from this computer (sun-panel_vX_linux_arm64.tar.gz), useful when GitHub is unreachable.') ]),
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(self, function(ev) {
					return self.uploadAndInstall(ev);
				})
			}, [ _('Upload and install release tarball') ])
		]));

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Update progress') ]),
			progress
		]));

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Locally kept versions') ]),
			localReleases
		]));

		this.renderLocalReleases(localReleases, info);
		this.renderUpdateStatus(progress, null);
	},

	showCheckResult: function(box, res) {
		var self = this;
		box.innerHTML = '';

		var cards = [ res.stable, res.beta ];
		var titles = [ _('Stable channel'), _('Beta channel') ];

		for (var i = 0; i < cards.length; i++) {
			var r = cards[i];
			if (!r) {
				box.appendChild(E('p', {}, [ '%s：%s'.format(titles[i], _('No release available')) ]));
				continue;
			}
			var isCurrent = (r.tag == res.current);
			var btn = E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'disabled': isCurrent ? 'disabled' : null,
				'click': ui.createHandlerFn(self, function(tag, url, sha, ev) {
					self.confirmInstall(tag, url, sha);
				}, r.tag, r.url, r.sha256)
			}, [ isCurrent ? _('Current version') : _('Install this version') ]);

			box.appendChild(E('div', { 'class': 'cbi-section', 'style': 'border:1px solid var(--border-color); border-radius:4px; padding:.6em; margin-bottom:.6em' }, [
				E('p', {}, [
					E('strong', {}, [ r.tag ]),
					' ',
					r.prerelease ? badge(_('Pre-release'), 'label-warning') : badge(_('Official release'), 'label-success'),
					' ',
					isCurrent ? badge(_('Installed'), 'label-info') : E('span', {}, [ '' ])
				]),
				E('p', {}, [
					_('Released: %s  Size: %s').format((r.date || '-').slice(0, 10), fmtSize(r.size))
				]),
				btn
			]));
		}
	},

	confirmInstall: function(tag, url, sha) {
		var self = this;
		ui.showModal(_('Install Sun-Panel %s').format(tag), [
			E('p', {}, [ _('The current version is backed up automatically; the updater rolls back if the new version fails to start.') ]),
			E('p', {}, [ _('The service restarts briefly. Continue?') ]),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, [ _('Cancel') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-important',
					'click': ui.createHandlerFn(self, function() {
						ui.hideModal();
						return self.startUpdate(tag, url, sha);
					})
				}, [ _('Install') ])
			])
		]);
	},

	startUpdate: function(tag, url, sha) {
		var self = this;
		self._jobActive = true;
		return disp('update-start', [ tag, url, sha || '-' ]).then(function() {
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('Update job started, watch the progress below') ]), 4000);
		}).catch(function(e) {
			self._jobActive = false;
			ui.addNotification(null, E('p', {}, [ _('Failed to start update: %s').format(e) ]));
		});
	},

	uploadAndInstall: function(ev) {
		var self = this;
		return ui.uploadFile('/tmp/sunpanel-upload/release.tar.gz').then(function(res) {
			self._jobActive = true;
			return disp('release-import', [ '/tmp/sunpanel-upload/release.tar.gz' ]);
		}).then(function() {
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('Offline install job started') ]), 4000);
		}).catch(function(e) {
			self._jobActive = false;
			ui.addNotification(null, E('p', {}, [ _('Upload or install failed: %s').format(e) ]));
		});
	},

	renderUpdateStatus: function(box, st) {
		if (st == null || st.phase == null || st.phase == '') {
			box.innerHTML = '';
			box.appendChild(E('em', {}, [ _('No update job yet') ]));
			return;
		}
		if (st.phase == 'done' || st.phase == 'failed')
			this._jobActive = false;

		var cls = (st.phase == 'failed') ? 'alert-danger' : (st.phase == 'done' ? 'alert-success' : 'alert-info');
		box.innerHTML = '';
		box.appendChild(E('div', { 'class': 'alert ' + cls }, [
			E('p', {}, [
				E('strong', {}, [ '%s：%s'.format(_('State'), phaseText(st.phase)) ]),
				st.version ? '　' + _('Version: %s').format(st.version) : E('span', {}, [ '' ])
			]),
			st.message ? E('p', {}, [ st.message ]) : E('span', {}, [ '' ]),
			E('pre', { 'style': 'max-height:200px; overflow:auto; margin:.4em 0 0 0' }, [ st.log || _('(no log yet)') ])
		]));
	},

	renderLocalReleases: function(box, info) {
		var self = this;
		box.innerHTML = '';
		var rels = info.releases || [];
		if (rels.length == 0) {
			box.appendChild(E('em', {}, [ _('No stored versions') ]));
			return;
		}
		rels.sort(function(a, b) { return (b.mtime || 0) - (a.mtime || 0); });
		var rows = [];
		for (var i = 0; i < rels.length; i++) {
			var r = rels[i];
			var isCur = (r.version == info.installed_version);
			rows.push(E('tr', {}, [
				E('td', {}, [ r.version, isCur ? badge(_('current'), 'label-success') : E('span', {}, [ '' ]) ]),
				E('td', {}, [ fmtSize(r.size) ]),
				E('td', {}, [
					!isCur ? E('button', {
						'class': 'btn cbi-button',
						'click': ui.createHandlerFn(self, function(v, ev) {
							self.confirmRollback(v);
						}, r.version)
					}, [ _('Roll back to this version') ]) : E('span', {}, [ '-' ]),
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
					}, [ _('Delete') ]) : E('span', {}, [ '' ])
				])
			]));
		}
		box.appendChild(E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', {}, [ _('Version') ]),
				E('th', {}, [ _('Size') ]),
				E('th', {}, [ _('Actions') ])
			])
		].concat(rows)));
	},

	confirmRollback: function(ver) {
		var self = this;
		ui.showModal(_('Roll back to %s').format(ver), [
			E('p', {}, [ _('The current version is kept as a history entry; the service restarts on %s.').format(ver) ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Cancel') ]),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-important',
					'click': ui.createHandlerFn(self, function() {
						ui.hideModal();
						self._jobActive = true;
						return disp('rollback', [ ver ]).then(function() {
							ui.addTimeLimitedNotification(null, E('p', {}, [ _('Rollback job started') ]), 4000);
						}).catch(function(e) {
							self._jobActive = false;
							ui.addNotification(null, E('p', {}, [ _('Rollback failed: %s').format(e) ]));
						});
					})
				}, [ _('Roll back') ])
			])
		]);
	},

	renderMigrateTab: function(box, info, st) {
		var self = this;
		box.innerHTML = '';
		var stage = st ? (st.stage || '') : '';

		/* step indicator */
		var steps = [
			[ '', _('Detect v1') ],
			[ 'backup', _('Upload backup') ],
			[ 'deployed', _('Deploy v2 test instance') ],
			[ 'verified', _('Import and verify') ],
			[ 'switched', _('Switch port') ],
			[ 'done', _('Finish and clean up') ]
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
		}, [ _('Detect legacy v1') ]);

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
					ui.addNotification(null, E('p', {}, [ _('Upload failed: %s').format(e) ]));
				});
			})
		}, [ _('Upload v1 backup (zip)') ]);

		var bDeploy = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'deploy' ]).then(function() {
					ui.addTimeLimitedNotification(null, E('p', {}, [ _('Deployment job started') ]), 4000);
				}).catch(function(e) {
					self._migratePolling = false;
					ui.addNotification(null, E('p', {}, [ _('Deployment failed: %s').format(e) ]));
				});
			})
		}, [ _('Deploy v2 test instance (port 3004)') ]);

		var bVerify = E('button', {
			'class': 'btn cbi-button',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'verify' ]);
			})
		}, [ _('Verify test instance') ]);

		var bSwitch = E('button', {
			'class': 'btn cbi-button cbi-button-important',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'switch' ]).then(function() {
					ui.addTimeLimitedNotification(null, E('p', {}, [ _('Switch job started') ]), 4000);
				}).catch(function(e) {
					ui.addNotification(null, E('p', {}, [ _('Switch failed: %s').format(e) ]));
				});
			})
		}, [ _('Switch to production port') ]);

		var bFinish = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function(ev) {
				self._migratePolling = true;
				return disp('migrate', [ 'finish' ]);
			})
		}, [ _('Finish (archive v1)') ]);

		var bAbort = E('button', {
			'class': 'btn cbi-button cbi-button-negative',
			'click': ui.createHandlerFn(self, function(ev) {
				return disp('migrate', [ 'abort' ]).then(function() {
					self._migratePolling = true;
				});
			})
		}, [ _('Abort and restore v1') ]);

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
			row.appendChild(E('em', {}, [ _('Deploying, please wait…') ]));
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
			box.appendChild(E('div', { 'class': 'alert alert-success' }, [ _('Migration complete. The legacy v1 has been archived; see the version manager.') ]));
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
				E('div', { 'class': 'cbi-section-title' }, [ _('Detected legacy v1') ]),
				kvTable([
					[ _('Version'), det.version || 'unknown' ],
					[ _('Data directory'), det.dir ],
					[ _('Port'), det.port ],
					[ _('Running'), det.running == '1' ? _('Yes') : _('No') ],
					[ _('Backup archive'), det.backup_ready == '1' ? _('Uploaded') : _('Not uploaded') ]
				])
			]));
		}

		/* import guidance */
		if (stage == 'deployed') {
			box.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('p', {}, [
					_('Please open '),
					' ',
					E('a', { 'href': 'http://' + window.location.hostname + ':3004/', 'target': '_blank' }, [ 'http://' + window.location.hostname + ':3004/' ]),
					_(', sign in to the fresh v2 with the default account admin@sun.cc / 12345678, then import the uploaded v1 backup under "System Settings → Backup & Restore". After verifying the content, return here and click "Verify test instance".')
				])
			]));
		}

		/* emergency controls */
		box.appendChild(E('div', { 'class': 'cbi-section', 'style': 'margin-top:1.5em' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Emergency actions') ]),
			E('p', {}, [ _('To temporarily fall back to v1 when v2 misbehaves (only while v1 has not been cleaned up):') ]),
			E('button', {
				'class': 'btn cbi-button cbi-button-negative',
				'click': ui.createHandlerFn(self, function(ev) {
					return disp('legacy-force', [ 'on' ]).then(function() {
						ui.addTimeLimitedNotification(null, E('p', {}, [ _('Switched to v1 compat mode') ]), 4000);
					}).catch(function(e) {
						ui.addNotification(null, E('p', {}, [ _('Operation failed: %s').format(e) ]));
					});
				})
			}, [ _('Force back to v1') ]),
			' ',
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(self, function(ev) {
					return disp('legacy-force', [ 'off' ]).then(function() {
						ui.addTimeLimitedNotification(null, E('p', {}, [ _('v1 forced mode disabled') ]), 4000);
					});
				})
			}, [ _('Disable v1 forced mode') ])
		]));
	}
});
