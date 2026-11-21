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

			// dirty tracking: baseline = values as loaded from the config
			var base = {
				ENABLED: conf.ENABLED == '1' ? '1' : '0',
				PORT: conf.PORT || '',
				HTTPS_PORT: conf.HTTPS_PORT || '',
				LISTEN_ADDRESS: conf.LISTEN_ADDRESS || '',
				TOKEN_EXPIRES: conf.TOKEN_EXPIRES || '',
				DATA_DIR: conf.DATA_DIR || '',
				DOCKER_HOST: conf.DOCKER_HOST || ''
			};
			function curVals() {
				return {
					ENABLED: enabledCb.checked ? '1' : '0',
					PORT: portInput.value,
					HTTPS_PORT: httpsInput.value,
					LISTEN_ADDRESS: listenInput.value,
					TOKEN_EXPIRES: tokenInput.value,
					DATA_DIR: dataDirInput.value,
					DOCKER_HOST: dockerHostInput.value
				};
			}
			var saveBtn = E('button', {
				'class': 'btn cbi-button cbi-button-action',
				'click': ui.createHandlerFn(self, function() {
					var vals = curVals();
					return self.saveSettings(vals).then(function() {
						setSpan.textContent = _('Settings saved');
						setSpan.style.color = '#2e7d32';
						base = vals;
						syncSave();
					}).catch(function(e) {
						setSpan.textContent = _('Operation failed: %s').format(e);
						setSpan.style.color = 'red';
					});
				})
			}, [ _('Save settings') ]);
			function syncSave() {
				var dirty = false, c = curVals(), k;
				for (k in base) {
					if (String(base[k]) != String(c[k])) {
						dirty = true;
						break;
					}
				}
				saveBtn.disabled = dirty ? null : 'disabled';
				if (dirty && setSpan.textContent != '')
					setSpan.textContent = '';
			}
			enabledCb.addEventListener('change', syncSave);
			var sinputs = [ portInput, httpsInput, listenInput, tokenInput, dataDirInput, dockerHostInput ];
			for (var si = 0; si < sinputs.length; si++)
				sinputs[si].addEventListener('input', syncSave);
			syncSave();

			box.appendChild(kvTable([
				[ _('Enable service'), enabledCb ],
				[ _('HTTP port'), portInput ],
				[ _('HTTPS port'), httpsInput ],
				[ _('Listen address'), listenInput ],
				[ _('Token lifetime (hours)'), tokenInput ],
				[ _('Data directory'), dataDirInput ],
				[ _('Docker host'), dockerHostInput ],
				[ '', E('div', { 'style': 'display:flex; align-items:center; gap:.5em' }, [
					saveBtn,
					setSpan
				]) ]
			]));
		}).catch(function(e) {
			box.innerHTML = '';
			box.appendChild(E('div', { 'class': 'alert alert-danger' }, [ _('Failed to load settings: %s').format(e) ]));
		});
	},

	saveSettings: function(v) {
		return disp('conf-save', [ JSON.stringify(v) ]);
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

		var relSpan = E('span', { 'style': 'margin-left:.5em' }, [ '' ]);

		// dirty tracking: baseline = values as loaded from the config
		var base = {
			APP_DIR: info.app_dir || '',
			CHANNEL: channel(info),
			MIRROR: info.mirror || '',
			PROXY: info.proxy || ''
		};
		function curVals() {
			return {
				APP_DIR: appDirInput.value,
				CHANNEL: chSel.value,
				MIRROR: mirrorInput.value,
				PROXY: proxyInput.value
			};
		}
		var saveBtn = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': ui.createHandlerFn(self, function() {
				var vals = curVals();
				return self.saveReleaseSettings(vals).then(function() {
					relSpan.textContent = _('Settings saved');
					relSpan.style.color = '#2e7d32';
					base = vals;
					syncSave();
				}).catch(function(e) {
					relSpan.textContent = _('Operation failed: %s').format(e);
					relSpan.style.color = 'red';
				});
			})
		}, [ _('Save settings') ]);
		function syncSave() {
			var dirty = false, c = curVals(), k;
			for (k in base) {
				if (String(base[k]) != String(c[k])) {
					dirty = true;
					break;
				}
			}
			saveBtn.disabled = dirty ? null : 'disabled';
			if (dirty && relSpan.textContent != '')
				relSpan.textContent = '';
		}
		appDirInput.addEventListener('input', syncSave);
		mirrorInput.addEventListener('input', syncSave);
		proxyInput.addEventListener('input', syncSave);
		chSel.addEventListener('change', syncSave);
		syncSave();

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
					self.confirmInstall(e.name || e.tag, e.tag, e.url, e.sha256);
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
		var instText = info.installed_version || '-';
		var chk = self._lastCheck;
		if (chk) {
			var list = (channel(info) == 'stable') ? (chk.stable_list || []) : (chk.beta_list || []);
			if (list.length > 0) {
				var all = (chk.stable_list || []).concat(chk.beta_list || []);
				for (var k = 0; k < all.length; k++) {
					if (all[k].tag == info.installed_version) {
						instText = all[k].name || all[k].tag;
						break;
					}
				}
				latestText = list[0].name || list[0].tag;
				var opts = [];
				for (var i = 0; i < list.length; i++) {
					opts.push(E('option', {
						'value': '' + i,
						'selected': i == 0 ? 'selected' : null
					}, [ '%s  ·  %s  ·  %s'.format(list[i].name || list[i].tag, (list[i].date || '').slice(0, 10), fmtSize(list[i].size)) ]));
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
				saveBtn,
				updateBtn,
				checkBtn,
				relSpan
			]) ],
			[ _('Installed version'), instText ],
			[ _('Latest version'), latestText ],
			[ _('Select version'), selWidget ]
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

	saveReleaseSettings: function(v) {
		var self = this;
		return disp('conf-save', [ JSON.stringify(v) ]).then(function() {
			return disp('info');
		}).then(function(inf) {
			self._info = inf;
		});
	},

	confirmInstall: function(label, tag, url, sha) {
		var self = this;
		ui.showModal(_('Install Sun-Panel %s').format(label), [
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
