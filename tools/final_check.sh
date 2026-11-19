#!/bin/sh
curl -s -m 5 http://127.0.0.1:8080/luci-static/resources/view/sunpanel.js > /tmp/s.js
echo "V2-label: $(grep -c "'V2'" /tmp/s.js)"
echo "cbi-section-in-version-tab (should be 0): $(grep -c 'Release source' /tmp/s.js)"
echo "addTimeLimited (should be 0): $(grep -c addTimeLimitedNotification /tmp/s.js)"
echo "initTabGroup: $(grep -c initTabGroup /tmp/s.js)"
rm -f /tmp/s.js
