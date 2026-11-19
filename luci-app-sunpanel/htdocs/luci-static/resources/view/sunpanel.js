'use strict';
'require view';
'require fs';
'require ui';
'require rpc';
'require uci';
'require poll';
'require form';
'require dom';

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

function channel(info) {
	return (info && info.channel) ? info.channel : 'beta';
}

return view.extend({
	_jobActive: false,
	_info: null,

	load: function() {
		return Promise.all([
			disp('info'),
			uci.load('sunpanel')
		]);
	},

	render: function(data) {
		var self = this;
		self._info = data[0];

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

		this.renderStatusBox(statusBox, self._info);

		/* ================= version tab ================= */
		var versionBox = E('div', {});
		tabVersion.appendChild(versionBox);
		this.renderVersionTab(versionBox, self._info);

		/* ---------- polling ---------- */
		poll.add(L.bind(function() {
			return disp('info').then(function(inf) {
				self._info = inf;
				self.renderStatusBox(statusBox, inf);
			}).catch(function() {});
		}, this), 5);

		poll.add(L.bind(function() {
			if (!self._jobActive)
				return Promise.resolve();
			return disp('update-status').then(function(res) {
				var st = res.state;
				if (st.phase == 'done') {
					self._jobActive = false;
					return disp('info').then(function(inf) {
						self._info = inf;
						self.renderVersionTab(versionBox, inf);
						ui.addTimeLimitedNotification(null, E('p', {}, [ _('Update installed successfully') ]), 6000);
					});
				}
				if (st.phase == 'failed') {
					self._jobActive = false;
					ui.addNotification(null, E('p', {}, [ _('Update failed, rolled back automatically') + (st.message ? ': ' + st.message : '') ]));
				}
			}).catch(function() {});
		}, this), 3);

		// settings tab: form.Map#render is asynchronous; init tabs once present
		return this.buildSettings(self._info).then(function(settingsNode) {
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

		box.innerHTML = '';
		box.appendChild(kvTable([
			[ _('Status'), (info.running ? badge(_('Running'), 'label-success') : badge(_('Stopped'), 'label-danger')) ],
			[ _('Mode'), modeText[info.mode] || info.mode ],
			[ _('Installed version'), info.installed_version || '-' ],
			[ _('Listen port'), info.port ],
			[ _('Autostart'), info.service_enabled ? _('Yes') : _('No') ],
			[ _('Program directory'), info.app_dir ],
			[ _('Data directory'), info.data_dir ]
		]));

		box.appendChild(E('div', { 'style': 'margin-top:.8em' }, [
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
			}, [ _('Restart') ]),
			' ',
			E('a', {
				'href': 'http://' + window.location.hostname + ':' + info.port + '/',
				'target': '_blank',
				'class': 'btn cbi-button cbi-button-action'
			}, [ _('Open panel') ])
		]));
	},

	/* ================= settings tab (uniform layout) ================= */

	buildSettings: function(info) {
		var self = this;
		var m, s, o;
		var isLegacy = (info.mode == 'legacy');

		m = new form.Map('sunpanel', _('Sun-Panel basic configuration'));

		s = m.section(form.NamedSection, 'sunpanel', 'sunpanel', _('Global settings'));
		s.addremove = false;

		if (isLegacy)
			o = s.option(form.DummyValue, '_legacyhint', _('v1 compat mode: network settings follow the old configuration and will take effect after v2 is installed.'));

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

		o = s.option(form.Flag, 'manage_conf', _('Manage conf.ini from LuCI'));
		o.default = o.enabled;
		o.description = _('When enabled, conf/conf.ini is regenerated from these options at every service start; when disabled it is only created once and manual edits survive');

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

	/* ================= version tab ================= */

	renderVersionTab: function(box, info) {
		var self = this;
		box.innerHTML = '';

		/* ---------- release source settings ---------- */
		var appDirInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'value': info.app_dir,
			'style': 'width:100%'
		});
		var mirrorInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'value': info.mirror || '',
			'placeholder': _('Empty for direct connection, e.g. https://ghfast.top'),
			'style': 'width:100%'
		});
		var proxyVal = '';
		try {
			proxyVal = uci.get('sunpanel', 'sunpanel', 'proxy') || '';
		} catch (e) {}
		var proxyInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'value': proxyVal,
			'placeholder': _('Empty to disable, e.g. http://127.0.0.1:7890'),
			'style': 'width:100%'
		});
		var chSel = E('select', { 'class': 'cbi-input-select', 'style': 'width:auto' }, [
			E('option', { 'value': 'stable', 'selected': (channel(info) == 'stable') ? 'selected' : null }, [ _('Stable (v1.x line)') ]),
			E('option', { 'value': 'beta', 'selected': (channel(info) == 'beta') ? 'selected' : null }, [ _('Beta (v2 line)') ])
		]);

		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Release source') ]),
			E('table', { 'class': 'table' }, [
				E('tr', {}, [ E('td', { 'style': 'width:33%' }, [ _('Program directory') ]), E('td', {}, [ appDirInput ]) ]),
				E('tr', {}, [ E('td', {}, [ _('Update channel') ]), E('td', {}, [ chSel ]) ]),
				E('tr', {}, [ E('td', {}, [ _('GitHub mirror prefix') ]), E('td', {}, [ mirrorInput ]) ]),
				E('tr', {}, [ E('td', {}, [ _('Download proxy') ]), E('td', {}, [ proxyInput ]) ]),
				E('tr', {}, [ E('td', {}, [ '' ]), E('td', {}, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(self, function() {
							return self.saveReleaseSettings(box, {
								app_dir: appDirInput.value,
								channel: chSel.value,
								mirror: mirrorInput.value,
								proxy: proxyInput.value
							});
						})
					}, [ _('Save settings') ])
				]) ])
			])
		]));

		/* ---------- check & install (persistent result) ---------- */
		var checkResult = E('div', {}, E('em', {}, [ _('Click "Check for updates" to load the version list.') ]));
		box.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-section-title' }, [ _('Check for updates') ]),
			E('p', {}, [
				_('Installed version: %s').format(info.installed_version || _('Not installed')),
				'　',
				_('Architecture: %s').format(info.arch)
			]),
			E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(self, function(ev) {
					ev.target.disabled = true;
					dom.content(checkResult, E('em', { 'class': 'spinning' }, [ _('Checking…') ]));
					return disp('check-update').then(function(res) {
						self._lastCheck = res;
						self.showCheckResult(checkResult, res, channel(info));
					}).catch(function(e) {
						dom.content(checkResult, E('div', { 'class': 'alert alert-danger' }, [ _('Check failed: %s').format(e) ]));
					}).finally(function() {
						ev.target.disabled = false;
					});
				})
			}, [ _('Check latest GitHub releases') ]),
			E('div', { 'data-check-result': '1', 'style': 'margin-top:.8em' }, [ checkResult ])
		]));
	},

	showCheckResult: function(box, res, chan) {
		var self = this;
		var list = (chan == 'stable') ? (res.stable_list || []) : (res.beta_list || []);
		dom.content(box, E('span', {}, []));

		if (list.length == 0) {
			box.appendChild(E('p', {}, [ _('No release available in this channel') ]));
			if (chan == 'stable')
				box.appendChild(E('p', {}, [ _('No stable v2 release exists yet; stable channel currently tracks v1.8.x.') ]));
			return;
		}

		var latest = list[0];
		var opts = [];
		for (var i = 0; i < list.length; i++) {
			opts.push(E('option', {
				'value': '' + i,
				'selected': i == 0 ? 'selected' : null
			}, [ '%s  ·  %s  ·  %s'.format(list[i].tag, (list[i].date || '').slice(0, 10), fmtSize(list[i].size)) ]));
		}
		var verSel = E('select', { 'class': 'cbi-input-select', 'style': 'width:auto; min-width:280px' }, opts);

		var installBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action'
		}, [ _('Install selected version') ]);
		installBtn.onclick = function(ev) {
			var e = list[+verSel.value];
			if (e)
				self.confirmInstall(e.tag, e.url, e.sha256);
		};

		var isCurrent = (latest.tag == res.current);
		box.appendChild(E('div', { 'class': 'cbi-section', 'style': 'border:1px solid var(--border-color); border-radius:4px; padding:.6em' }, [
			E('p', {}, [
				E('strong', {}, [ latest.tag ]),
				' ',
				latest.prerelease ? badge(_('Pre-release'), 'label-warning') : badge(_('Official release'), 'label-success'),
				isCurrent ? badge(_('Installed'), 'label-info') : E('span', {}, [ '' ])
			]),
			E('p', {}, [ _('Select a version to install') ]),
			E('div', {}, [ verSel ]),
			E('div', { 'style': 'margin-top:.6em' }, [ installBtn ])
		]));
	},

	saveReleaseSettings: function(box, vals) {
		var self = this;
		uci.set('sunpanel', 'sunpanel', 'app_dir', vals.app_dir);
		uci.set('sunpanel', 'sunpanel', 'channel', vals.channel);
		uci.set('sunpanel', 'sunpanel', 'mirror', vals.mirror);
		uci.set('sunpanel', 'sunpanel', 'proxy', vals.proxy);
		return uci.save().then(function() {
			return uci.apply(10);
		}).then(function() {
			return disp('info');
		}).then(function(inf) {
			self._info = inf;
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('Release source settings saved') ]), 3000);
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, [ _('Operation failed: %s').format(e) ]));
		});
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
			ui.addTimeLimitedNotification(null, E('p', {}, [ _('Update job started') ]), 4000);
		}).catch(function(e) {
			self._jobActive = false;
			ui.addNotification(null, E('p', {}, [ _('Failed to start update: %s').format(e) ]));
		});
	}
});
