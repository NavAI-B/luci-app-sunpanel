# SPDX-License-Identifier: Apache-2.0
#
# luci-app-sunpanel -- LuCI management UI for Sun-Panel v2 on OpenWrt/ImmortalWrt
#
# Build inside the luci feed: feeds/luci/applications/luci-app-sunpanel

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sunpanel
PKG_VERSION:=1.0.0
PKG_RELEASE:=4
PKG_PO_VERSION:=1.0.0

LUCI_TITLE:=LuCI support for Sun-Panel v2 (service, updates, v1 migration)
LUCI_DESCRIPTION:=procd service management, GitHub release updater with \
 rollback, v1->v2 migration wizard and zh-cn i18n for Sun-Panel.
LUCI_DEPENDS:=+luci-base +curl +ucode +ucode-mod-fs +ucode-mod-uci +rpcd +rpcd-mod-file
LUCI_PKGARCH:=all

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=sun-panel-home

define Package/luci-app-sunpanel/conffiles
/etc/config/sunpanel
endef

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
