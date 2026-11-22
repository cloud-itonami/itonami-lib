## Feature parity (required before merge)

Rule (Decision, 2026-11-22): every KOTOBA-159 migration PR and every itonami-lib move PR carries this table. Fill it in from the code and a hands-on run of both builds, not from memory. If even one feature is lost or degraded, do not merge. Mark features that exist only on Android or only on the web in the Platform column.

| Feature | Before (main) | After (this PR) | Platform | How checked | Same? |
| --- | --- | --- | --- | --- | --- |
| Tabs shown, in order | | | all | | |
| Content of each tab (概要, 操作卓の見本, 物理仕様, この app について) | | | all | | |
| Selected tab kept across launches (trusted-page-v1: localStorage; restricted-wasm-v1: memory only) | | | all | | |
| Keyboard tab navigation (arrows, Home, End) | | | all | | |
| Attribution lines (ISCO-08, UNSPSC) in この app について | | | all | | |
| Phone layout: tabs wrap, page never scrolls sideways, wide tables scroll in their box | | | Android | | |
| System bar insets and colours, light and dark | | | Android | | |
| No network: CSP connect-src, no INTERNET permission | | | all / Android | | |
| Deep links, the browser's Back button, anchors | | | web | | |
| Scroll position restored on Back (measure scrollY before and after) | | | all | | |
| Offline behaviour | | | all | | |
| Recents and screenshot behaviour | | | Android | | |
| Package id, label, version | | | Android | | |
| Anything else the app does (list it) | | | | | |

Write "none before, none after" for a feature the app never had, so a reader can tell "absent" from "not checked".
