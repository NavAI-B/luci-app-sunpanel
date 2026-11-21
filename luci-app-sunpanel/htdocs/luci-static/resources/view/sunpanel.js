'use strict';
'require view';
'require fs';
'require ui';
'require rpc';
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

function badge(text, cls) {
	return E('span', { 'class': 'label ' + (cls || 'label-info'), 'style': 'margin-left:.4em' }, [ text ]);
}

function kvTable(rows) {
	var tbl = E('table', { 'class': 'table' });
	for (var i = 0; i < rows.length; i++) {
		var tr = E('tr', {}, [ E('td', { 'style': 'width:220px; vertical-align:middle' }, [ rows[i][0] ]) ]);
		for (var j = 1; j < rows[i].length; j++)
			tr.appendChild(E('td', { 'style': 'vertical-align:middle' }, [ rows[i][j] ]));
		tbl.appendChild(tr);
	}
	return tbl;
}

function textInput(value, placeholder) {
	return E('input', {
		'type': 'text', 'class': 'cbi-input-text', 'value': value || '',
		'placeholder': placeholder || '', 'style': 'width:100%'
	});
}

function channel(info) {
	return (info && info.channel) ? info.channel : 'beta';
}

return view.extend({
	_jobActive: false,
	_info: null,
	_lastCheck: null,
	_verSel: null,
	_setSpan: null,
	_statusBox: null,
	_versionBox: null,

	load: function() {
		return disp('info');
	},

	render: function(info) {
		var self = this;
		self._info = info;

		var container = E('div', { 'class': 'cbi-map' });

		var tabStatus = E('div', { 'data-tab': 'status', 'data-tab-title': _('Service status') });
		var tabSettings = E('div', { 'data-tab': 'settings', 'data-tab-title': _('Basic settings') });
		var tabVersion = E('div', { 'data-tab': 'version', 'data-tab-title': _('Version manager') });
		var tabs = E('div', {}, [ tabStatus, tabSettings, tabVersion ]);
		container.appendChild(tabs);

		/* ================= status tab ================= */
		var statusBox = E('div', {}, E('em', {}, _('Loading…')));
		self._statusBox = statusBox;
		tabStatus.appendChild(statusBox);
		this.renderStatusBox(statusBox, info);

		/* ================= version tab ================= */
		var versionBox = E('div', {});
		self._versionBox = versionBox;
		tabVersion.appendChild(versionBox);
		this.renderVersionTab(versionBox, info);

		/* ================= settings tab (async prefill) ================= */
		var settingsBox = E('div', {}, E('em', {}, _('Loading…')));
		self._setSpan = null;
		tabSettings.appendChild(settingsBox);

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
					});
				}
				if (st.phase == 'failed') {
					self._jobActive = false;
					ui.addNotification(null, E('p', {}, [ _('Update failed, rolled back automatically') + (st.message ? ': ' + st.message : '') ]));
					self.renderVersionTab(versionBox, self._info);
				}
			}).catch(function() {});
		}, this), 3);

		// settings tab: prefill from dispatcher, then init tabs
		return this.renderSettings(settingsBox).then(function() {
			ui.tabs.initTabGroup(tabs.childNodes);
			return container;
		});
	},

	renderStatusBox: function(box, info) {
		box.innerHTML = '';
		var openLink = E('a', {
			'href': 'http://' + window.location.hostname + ':' + info.port + '/',
			'target': '_blank',
			'class': 'btn cbi-button cbi-button-action'
		}, [ _('Open panel') ]);
		box.appendChild(kvTable([
			[ _('Status'), info.running ? E('span', {}, [ _('Running') ]) : E('span', { 'style': 'color:red' }, [ _('Stopped') ]) ],
			[ _('Installed version'), info.installed_version || '-' ],
			[ _('Listen port'), info.port ],
			[ _('Autostart'), info.service_enabled ? _('Yes') : _('No') ],
			[ _('Program directory'), info.app_dir ],
			[ _('Data directory'), info.data_dir ],
			[ '', openLink ]
		]));
	},

	/* ================= settings tab ================= */

	renderSettings: function(box) {
		var self = this;
		return disp('conf-get').then(function(conf) {
			box.innerHTML = '';

			var enabledCb = E('input', {
				'type': 'checkbox', 'class': 'cbi-input-checkbox',
				'checked': conf.ENABLED == '1' ? 'checked' : null
			});
			var portInput = textInput(conf.PORT, '3002');
			var httpsInput = textInput(conf.HTTPS_PORT, '3003');
			var listenInput = textInput(conf.LISTEN_ADDRESS, '0.0.0.0');
			var tokenInput = textInput(conf.TOKEN_EXPIRES, '168');
			var dataDirInput = textInput(conf.DATA_DIR);
			var dockerHostInput = textInput(conf.DOCKER_HOST, _('Empty for local /var/run/docker.sock, e.g. tcp://192.168.2.9:2375'));
			var setSpan = E('span', { 'style': 'margin-left:.5em' }, [ '' ]);
			self._setSpan = setSpan;

			box.appendChild(kvTable([
				[ _('Enable service'), enabledCb ],
				[ _('HTTP port'), portInput ],
				[ _('HTTPS port'), httpsInput ],
				[ _('Listen address'), listenInput ],
				[ _('Token lifetime (hours)'), tokenInput ],
				[ _('Data directory'), dataDirInput ],
				[ _('Docker host'), dockerHostInput ],
				[ '', E('div', { 'style': 'display:flex; align-items:center; gap:.5em' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(self, function() {
							return self.saveSettings({
								ENABLED: enabledCb.checked ? '1' : '0',
								PORT: portInput.value,
								HTTPS_PORT: httpsInput.value,
								LISTEN_ADDRESS: listenInput.value,
								TOKEN_EXPIRES: tokenInput.value,
								DATA_DIR: dataDirInput.value,
								DOCKER_HOST: dockerHostInput.value
							}, setSpan);
						})
					}, [ _('Save settings') ]),
					setSpan
				]) ]
			]));
			box.appendChild(E('div', { 'style': 'margin-top:2em', 'class': 'cbi-section' }, [
				E('p', { 'style': 'color:#888' }, [ _('Saving writes the configuration files; the service picks them up on the next start (toggle the enable switch off/on once to restart).') ])
			]));
		}).catch(function(e) {
			box.innerHTML = '';
			box.appendChild(E('div', { 'class': 'alert alert-danger' }, [ _('Failed to load settings: %s').format(e) ]));
		});
	},

	saveSettings: function(v, setSpan) {
		return disp('conf-save', [ JSON.stringify(v) ]).then(function() {
			if (setSpan) {
				setSpan.textContent = _('Settings saved');
				setSpan.style.color = '#2e7d32';
			}
		}).catch(function(e) {
			if (setSpan) {
				setSpan.textContent = _('Operation failed: %s').format(e);
				setSpan.style.color = 'red';
			}
		});
	},

	/* ================= version tab ================= */

	renderVersionTab: function(box, info) {
		var self = this;
		box.innerHTML = '';
		self._info = info;

		var appDirInput = textInput(info.app_dir);
		var mirrorInput = textInput(info.mirror || '', _('Empty for direct connection, e.g. https://ghfast.top'));
		var proxyInput = textInput(info.proxy || '', _('Empty to disable, e.g. http://127.0.0.1:7890'));
		var chSel = E('select', { 'class': 'cbi-input-select', 'style': 'width:auto' }, [
			E('option', { 'value': 'stable', 'selected': (channel(info) == 'stable') ? 'selected' : null }, [ 'V1' ]),
			E('option', { 'value': 'beta', 'selected': (channel(info) == 'beta') ? 'selected' : null }, [ 'V2' ])
		]);

		var updateBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function(ev) {
				if (self._jobActive)
					return;
				var sel = self._verSel;
				var idx = sel ? +sel.value : -1;
				var chk2 = self._lastCheck;
				var list2 = chk2 ? ((channel(self._info) == 'stable') ? (chk2.stable_list || []) : (chk2.beta_list || [])) : [];
				var e = list2[idx];
				if (e)
					self.confirmInstall(e.tag, e.url, e.sha256);
			})
		}, [ self._jobActive ? _('Updating…') : _('Update version') ]);
		if (self._jobActive || !self._lastCheck)
			updateBtn.disabled = 'disabled';

		var checkBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function(ev) {
				ev.target.disabled = true;
				return self.doCheck(box, ev.target);
			})
		}, [ _('Check for updates') ]);

		var latestText = '-';
		var selWidget = E('span', {}, [ '-' ]);
		var chk = self._lastCheck;
		if (chk) {
			var list = (channel(info) == 'stable') ? (chk.stable_list || []) : (chk.beta_list || []);
			if (list.length > 0) {
				latestText = list[0].tag;
				var opts = [];
				for (var i = 0; i < list.length; i++) {
					opts.push(E('option', {
						'value': '' + i,
						'selected': i == 0 ? 'selected' : null
					}, [ '%s  ·  %s  ·  %s'.format(list[i].tag, (list[i].date || '').slice(0, 10), fmtSize(list[i].size)) ]));
				}
				selWidget = self._verSel = E('select', { 'class': 'cbi-input-select', 'style': 'width:auto; min-width:280px' }, opts);
			}
		}

		box.appendChild(kvTable([
			[ _('Program directory'), appDirInput ],
			[ _('Update channel'), chSel ],
			[ _('GitHub mirror prefix'), mirrorInput ],
			[ _('Download proxy'), proxyInput ],
			[ '', E('div', { 'style': 'display:flex; gap:.5em; align-items:center' }, [
				updateBtn,
				checkBtn
			]) ],
			[ _('Installed version'), info.installed_version || '-' ],
			[ _('Latest version'), latestText ],
			[ _('Select version'), selWidget ]
		]));

		box.appendChild(E('div', { 'style': 'margin-top:1em; color:#888' }, [
			_('Saved release-source settings take effect on the next check/install; the running service only restarts during an update.')
		]));
	},

	doCheck: function(box, btn) {
		var self = this;
		btn.disabled = true;
		return disp('check-update').then(function(res) {
			self._lastCheck = res;
		}).then(function() {
			return disp('info');
		}).then(function(inf) {
			self._info = inf;
			self.renderVersionTab(box, inf);
		}).catch(function(e) {
			btn.disabled = false;
			ui.addNotification(null, E('p', {}, [ _('Check failed: %s').format(e) ]));
		});
	},

	saveReleaseSettings: function(box, vals) {
		var self = this;
		return disp('conf-save', [ JSON.stringify(vals) ]).then(function() {
			return disp('info');
		}).then(function(inf) {
			self._info = inf;
			self.renderVersionTab(box, inf);
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
			self.renderVersionTab(self._versionBox, self._info);
		}).catch(function(e) {
			self._jobActive = false;
			ui.addNotification(null, E('p', {}, [ _('Failed to start update: %s').format(e) ]));
		});
	}
});
