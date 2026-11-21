# SPDX-License-Identifier: Apache-2.0
#
# luci-app-sunpanel -- LuCI management UI for Sun-Panel v2 on OpenWrt/ImmortalWrt
#
# Build inside the luci feed: feeds/luci/applications/luci-app-sunpanel

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sunpanel
PKG_VERSION:=1.0.0
PKG_RELEASE:=18
PKG_PO_VERSION:=1.0.6

LUCI_TITLE:=LuCI support for Sun-Panel v2 (service, updates, remote docker)
LUCI_DESCRIPTION:=procd service management, GitHub release updater with \
 rollback and V1/V2 channels, remote docker host support, zh-cn i18n.
LUCI_DEPENDS:=+luci-base +curl +ucode +ucode-mod-fs +rpcd +rpcd-mod-file
LUCI_PKGARCH:=all

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=sun-panel-home

include ../../luci.mk

# call BuildPackage - OpenWrt buildroot signature
