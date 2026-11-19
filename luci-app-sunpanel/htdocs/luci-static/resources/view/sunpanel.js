'use strict';
'require view';
'require fs';
'require ui';
'require rpc';
'require uci';
'require poll';
'require form';

var callSetInit = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

var DISPATCH = '/usr/libexec/sunpanel-call';

function disp(action, args) {
	return fs.exec_direct(DISPATCH, [ action ].concat(args || []), 'json')
		.then(function(res) {
			if (!res || res.ok === false)
				return Promise.reject((res && res.error) ? res.error : _('Dispatcher call failed'));
			return res;
		});
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
		failed: _('Failed')
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

	load: function() {
		return Promise.all([
			disp('info'),
			uci.load('sunpanel')
		]);
	},

	render: function(data) {
		var self = this;
		var info = data[0];

		var container = E('div', { 'class': 'cbi-map' });

		var tabStatus = E('div', { 'data-tab': 'status', 'data-tab-title': _('Service status') });
		var tabSettings = E('div', { 'data-tab': 'settings', 'data-tab-title': _('Basic settings') });
		var tabVersion = E('div', { 'data-tab': 'version', 'data-tab-title': _('Version manager') });
		var tabs = E('div', {}, [ tabStatus, tabSettings, tabVersion ]);
		container.appendChild(tabs);

		/* ================= status tab ================= */
		var statusBox = E('div', {}, E('em', {}, _('Loading…')));
		tabStatus.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Status') ]),
			statusBox
		]));

		var logBox = E('pre', { 'class': 'ucli', 'style': 'max-height:300px; overflow:auto' }, [ _('(empty)') ]);
		tabStatus.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Service log') ]),
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(this, function() {
					return disp('logs', [ 'service', '60' ]).then(function(res) {
						logBox.textContent = res.log || _('(empty)');
					}).catch(function(e) { ui.addNotification(null, E('p', {}, [ e ])); });
				})
			}, [ _('Refresh service log') ]),
			E('div', { 'style': 'margin-top:.5em' }, [ logBox ])
		]));

		this.renderStatusBox(statusBox, info);

		/* ================= version tab ================= */
		var versionBox = E('div', {});
		tabVersion.appendChild(versionBox);
		this.renderVersionTab(versionBox, info);

		/* ---------- polling ---------- */
		poll.add(L.bind(function() {
			return disp('info').then(function(inf) {
				self.renderStatusBox(statusBox, inf);
			}).catch(function() {});
		}, this), 5);

		poll.add(L.bind(function() {
			if (!self._jobActive)
				return Promise.resolve();
			return disp('update-status').then(function(res) {
				self.renderUpdateStatus(versionBox.querySelector('[data-update-progress]'), res.state);
			}).catch(function() {});
		}, this), 3);

		// settings tab: form.Map#render is asynchronous; init tabs once present
		return this.buildSettings(info).then(function(settingsNode) {
			tabSettings.appendChild(settingsNode);
			ui.tabs.initTabGroup(tabs.childNodes);
			return container;
		});
	},

	renderStatusBox: function(box, info) {
		var modeText = {
			v2: _('v2 running'),
			legacy: _('v1 compat mode (v2 not installed yet)'),
			none: _('Not installed')
		};
		var openLink = E('a', {
			'href': 'http://' + window.location.hostname + ':' + info.port + '/',
			'target': '_blank',
			'class': 'btn cbi-button cbi-button-action',
			'style': 'margin-left:.5em'
		}, [ _('Open panel') ]);

		var rows = [
			[ _('Running'), (info.running ? badge(_('Running'), 'label-success') : badge(_('Stopped'), 'label-danger')) ],
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

		var ctrl = E('div', { 'style': 'margin-top:.8em' }, [
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(this, function() { return callSetInit('sunpanel', 'start'); })
			}, [ _('Start') ]),
			' ',
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(this, function() { return callSetInit('sunpanel', 'stop'); })
			}, [ _('Stop') ]),
			' ',
			E('button', {
				'class': 'btn cbi-button cbi-button-negative',
				'click': ui.createHandlerFn(this, function() { return callSetInit('sunpanel', 'restart'); })
			}, [ _('Restart') ])
		]);
		box.appendChild(ctrl);
	},

	buildSettings: function(info) {
		var self = this;
		var m, s, o;
		var isLegacy = (info.mode == 'legacy');

		m = new form.Map('sunpanel', _('Sun-Panel basic configuration'));

		s = m.section(form.NamedSection, 'sunpanel', 'sunpanel', _('Global settings'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable service'));
		o.default = o.enabled;
		o.rmempty = false;

		if (isLegacy) {
			o = s.option(form.DummyValue, '_legacyhint', _('v1 compat mode: network settings follow the old configuration and will take effect after v2 is installed.'));
		}
		else {
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
		}

		o = s.option(form.Value, 'data_dir', _('Data directory'));
		o.rmempty = false;
		o.description = _('Contains conf / database / uploads / runtime / custom / micro_app; keep it on a large partition');

		o = s.option(form.Value, 'app_dir', _('Program directory'));
		o.rmempty = false;
		o.description = _('Directory holding the sun-panel binary and web assets, managed by the version manager');

		if (!isLegacy) {
			o = s.option(form.Flag, 'manage_conf', _('Manage conf.ini from LuCI'));
			o.default = o.enabled;
			o.description = _('When enabled, conf/conf.ini is regenerated from these options at every service start; when disabled it is only created once and manual edits survive');
		}

		o = s.option(form.ListValue, 'channel', _('Update channel'));
		o.value('stable', _('Stable (official releases)'));
		o.value('beta', _('Beta (v2 pre-releases)'));
		o.description = _('No stable v2 release exists yet; choose beta to follow v2');

		o = s.option(form.Value, 'mirror', _('GitHub mirror prefix'));
		o.placeholder = _('Empty for direct connection, e.g. https://ghfast.top');
		o.description = _('Configure a mirror prefix when release downloads fail');

		o = s.option(form.Value, 'proxy', _('Download proxy'));
		o.placeholder = _('Empty to disable, e.g. http://127.0.0.1:7890');

		return m.render().then(function(mapNode) {
			return E('div', {}, [
				mapNode,
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-negative',
						'click': ui.createHandlerFn(self, function(ev) { return self.restartService(ev); })
					}, [ _('Restart service') ])
				])
			]);
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
		box.innerHTML = '';

		var channel = info.channel || 'beta';

		/* ---------- channel switcher ---------- */
		var chRow = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Update channel') ]),
			E('p', {}, [
				_('Installed version: %s').format(info.installed_version || _('Not installed')),
				'　',
				_('Architecture: %s').format(info.arch)
			])
		]);
		var mkChBtn = function(val, label) {
			var active = (channel == val);
			var attrs = { 'class': active ? 'btn cbi-button cbi-button-action' : 'btn cbi-button' };
			if (!active)
				attrs.click = ui.createHandlerFn(self, function(ev, v) { return self.switchChannel(box, v); }, val);
			return E('button', attrs, [ label ]);
		};
		chRow.appendChild(E('div', {}, [
			mkChBtn('stable', _('Stable (v1.x line)')),
			' ',
			mkChBtn('beta', _('Beta (v2 line)'))
		]));
		box.appendChild(chRow);

		/* ---------- check & install ---------- */
		var checkResult = E('div', {});
		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Check for updates') ]),
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(self, function(ev) {
					ev.target.disabled = true;
					checkResult.innerHTML = '';
					return disp('check-update').then(function(res) {
						self.showCheckResult(checkResult, res, channel);
					}).catch(function(e) {
						ui.addNotification(null, E('p', {}, [ _('Check failed: %s').format(e) ]));
					}).finally(function() {
						ev.target.disabled = false;
					});
				})
			}, [ _('Check latest GitHub releases') ]),
			E('div', { 'style': 'margin-top:.8em' }, [ checkResult ])
		]));

		/* ---------- offline install ---------- */
		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Offline install') ]),
			E('p', {}, [ _('Upload an official release tarball from this computer (sun-panel_vX_linux_arm64.tar.gz), useful when GitHub is unreachable.') ]),
			E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(self, function(ev) { return self.uploadAndInstall(ev); })
			}, [ _('Upload and install release tarball') ])
		]));

		/* ---------- progress ---------- */
		var progress = E('div', { 'data-update-progress': '1' }, []);
		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Update progress') ]),
			progress
		]));
		this.renderUpdateStatus(progress, null);

		/* ---------- local releases ---------- */
		var localReleases = E('div', {});
		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Locally kept versions') ]),
			localReleases
		]));
		this.renderLocalReleases(localReleases, info);
	},

	switchChannel: function(box, v) {
		var self = this;
		uci.set('sunpanel', 'sunpanel', 'channel', v);
		return uci.save().then(function() {
			return uci.apply(10);
		}).then(function() {
			return disp('info');
		}).then(function(inf) {
			self.renderVersionTab(box, inf);
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('Update channel switched, checking…') ]), 3000);
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, [ _('Operation failed: %s').format(e) ]));
		});
	},

	showCheckResult: function(box, res, channel) {
		var self = this;
		box.innerHTML = '';

		var r = (channel == 'stable') ? res.stable : res.beta;
		if (!r) {
			box.appendChild(E('p', {}, [ _('No release available in this channel') ]));
			return;
		}
		if (channel == 'stable')
			box.appendChild(E('p', {}, [ _('No stable v2 release exists yet; stable channel currently tracks v1.8.x.') ]));

		var isCurrent = (r.tag == res.current);
		var btnAttrs = { 'class': 'btn cbi-button cbi-button-action' };
		if (isCurrent)
			btnAttrs.disabled = 'disabled';
		else
			btnAttrs.click = ui.createHandlerFn(self, function(tag, url, sha, ev) {
				self.confirmInstall(tag, url, sha);
			}, r.tag, r.url, r.sha256);
		var btn = E('button', btnAttrs, [ isCurrent ? _('Current version') : _('Install this version') ]);

		box.appendChild(E('div', { 'class': 'cbi-section', 'style': 'border:1px solid var(--border-color); border-radius:4px; padding:.6em; margin-bottom:.6em' }, [
			E('p', {}, [
				E('strong', {}, [ r.tag ]),
				' ',
				r.prerelease ? badge(_('Pre-release'), 'label-warning') : badge(_('Official release'), 'label-success'),
				' ',
				isCurrent ? badge(_('Installed'), 'label-info') : E('span', {}, [ '' ])
			]),
			E('p', {}, [ _('Released: %s  Size: %s').format((r.date || '-').slice(0, 10), fmtSize(r.size)) ]),
			btn
		]));
	},

	confirmInstall: function(tag, url, sha) {
		var self = this;
		ui.showModal(_('Install Sun-Panel %s').format(tag), [
			E('p', {}, [ _('The current version is backed up automatically; the updater rolls back if the new version fails to start.') ]),
			E('p', {}, [ _('The service restarts briefly. Continue?') ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Cancel') ]),
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
		return ui.uploadFile('/tmp/sunpanel-upload/release.tar.gz').then(function() {
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
				E('td', {}, [ r.version, isCur ? badge(_('Installed'), 'label-success') : E('span', {}, [ '' ]) ]),
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
	}
});
