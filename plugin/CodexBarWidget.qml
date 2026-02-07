import QtQuick
import Quickshell
import qs.Common
import qs.Services
import qs.Widgets
import qs.Modules.Plugins

PluginComponent {
    id: root

    layerNamespacePlugin: "codexbar"

    property string codexBarPath: pluginData.codexBarPath || "/home/gabriel/Projects/Personal/codexbar-linux"
    property int refreshInterval: parseInt(pluginData.refreshInterval) || 120
    property int detectInterval: parseInt(pluginData.detectInterval) || 5
    property bool autoDetect: pluginData.autoDetect !== false

    property var providers: []
    property string activeProvider: ""
    property bool loading: true

    // Provider metadata
    readonly property var providerIcons: ({
        "claude": "smart_toy",
        "codex": "code",
        "cursor": "edit_note",
        "copilot": "hub",
        "kimi": "auto_awesome"
    })

    readonly property var providerColors: ({
        "claude": "#D4793C",
        "codex": "#10A37F",
        "cursor": "#00D1FF",
        "copilot": "#6E40C9",
        "kimi": "#7C3AED"
    })

    function usageColor(percent) {
        if (percent < 50) return Theme.primary
        if (percent < 80) return "#E5A100"
        return Theme.error
    }

    function getActiveProviderData() {
        if (!providers || providers.length === 0) return null

        // If auto-detect found a provider, show that
        if (activeProvider) {
            for (let i = 0; i < providers.length; i++) {
                if (providers[i].id === activeProvider && providers[i].primary) {
                    return providers[i]
                }
            }
        }

        // Fallback: show provider with highest primary usage
        let highest = null
        for (let i = 0; i < providers.length; i++) {
            const p = providers[i]
            if (p.primary && p.available && !p.error) {
                if (!highest || p.primary.percent_used > highest.primary.percent_used) {
                    highest = p
                }
            }
        }
        return highest
    }

    function timeUntil(isoDate) {
        if (!isoDate) return ""
        const now = Date.now()
        const target = new Date(isoDate).getTime()
        const diff = target - now
        if (diff <= 0) return "now"
        const hours = Math.floor(diff / 3600000)
        const minutes = Math.floor((diff % 3600000) / 60000)
        if (hours > 24) {
            const days = Math.floor(hours / 24)
            return days + "d " + (hours % 24) + "h"
        }
        if (hours > 0) return hours + "h " + minutes + "m"
        return minutes + "m"
    }

    // Fetch all provider data
    Timer {
        interval: root.refreshInterval * 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.fetchProviders()
    }

    // Detect active window
    Timer {
        interval: root.detectInterval * 1000
        running: root.autoDetect
        repeat: true
        triggeredOnStart: true
        onTriggered: root.detectWindow()
    }

    function fetchProviders() {
        Proc.runCommand(
            "codexBar.fetch",
            ["bun", "run", root.codexBarPath + "/src/index.ts", "--all"],
            (stdout, exitCode) => {
                if (exitCode === 0 && stdout.trim()) {
                    try {
                        const data = JSON.parse(stdout)
                        root.providers = data.providers || []
                        root.loading = false
                    } catch (e) {
                        console.error("CodexBar: Failed to parse JSON:", e)
                    }
                }
            },
            500
        )
    }

    function detectWindow() {
        Proc.runCommand(
            "codexBar.detect",
            ["bun", "run", root.codexBarPath + "/src/index.ts", "--detect"],
            (stdout, exitCode) => {
                if (exitCode === 0 && stdout.trim()) {
                    try {
                        const data = JSON.parse(stdout)
                        root.activeProvider = data.active_provider || ""
                    } catch (e) {}
                }
            },
            100
        )
    }

    horizontalBarPill: Component {
        Row {
            id: pillRow
            spacing: Theme.spacingXS

            property var activeData: root.getActiveProviderData()
            property int pct: activeData && activeData.primary ? activeData.primary.percent_used : 0
            property string providerId: activeData ? activeData.id : ""

            DankIcon {
                anchors.verticalCenter: parent.verticalCenter
                name: root.loading ? "hourglass_empty" : (root.providerIcons[pillRow.providerId] || "monitoring")
                color: root.loading ? Theme.surfaceVariantText : root.usageColor(pillRow.pct)
                size: Theme.fontSizeLarge
            }

            StyledText {
                anchors.verticalCenter: parent.verticalCenter
                text: root.loading ? "..." : (pillRow.pct + "%")
                color: root.loading ? Theme.surfaceVariantText : root.usageColor(pillRow.pct)
                font.pixelSize: Theme.fontSizeMedium
                font.weight: Font.Medium
            }
        }
    }

    verticalBarPill: Component {
        Column {
            spacing: Theme.spacingXS

            property var activeData: root.getActiveProviderData()
            property int pct: activeData && activeData.primary ? activeData.primary.percent_used : 0
            property string providerId: activeData ? activeData.id : ""

            DankIcon {
                anchors.horizontalCenter: parent.horizontalCenter
                name: root.loading ? "hourglass_empty" : (root.providerIcons[providerId] || "monitoring")
                color: root.loading ? Theme.surfaceVariantText : root.usageColor(pct)
                size: Theme.fontSizeMedium
            }

            StyledText {
                anchors.horizontalCenter: parent.horizontalCenter
                text: root.loading ? ".." : (pct + "%")
                color: root.loading ? Theme.surfaceVariantText : root.usageColor(pct)
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
            }
        }
    }

    popoutContent: Component {
        PopoutComponent {
            id: popout

            headerText: "CodexBar"
            showCloseButton: true

            Item {
                width: parent.width
                implicitHeight: root.popoutHeight - popout.headerHeight - Theme.spacingL

                Flickable {
                    anchors.fill: parent
                    contentHeight: providerColumn.implicitHeight
                    clip: true

                    Column {
                        id: providerColumn
                        width: parent.width
                        spacing: Theme.spacingXS

                        Repeater {
                            model: root.providers

                            Item {
                                width: providerColumn.width
                                height: 68
                                visible: modelData.available

                                StyledRect {
                                    anchors.fill: parent
                                    radius: Theme.cornerRadius
                                    color: modelData.id === root.activeProvider ? Theme.surfaceContainerHigh : "transparent"

                                    Row {
                                        anchors.fill: parent
                                        anchors.leftMargin: Theme.spacingS
                                        anchors.rightMargin: Theme.spacingS
                                        spacing: Theme.spacingM

                                        // Primary ring
                                        Item {
                                            width: 48
                                            height: 48
                                            anchors.verticalCenter: parent.verticalCenter

                                            Canvas {
                                                anchors.fill: parent
                                                property real pct: modelData.primary ? Math.min(modelData.primary.percent_used, 100) / 100 : 0
                                                property color ringColor: modelData.primary ? root.usageColor(modelData.primary.percent_used) : Theme.surfaceContainerHighest
                                                property color trackColor: Theme.surfaceContainerHighest

                                                onPctChanged: requestPaint()
                                                onRingColorChanged: requestPaint()

                                                onPaint: {
                                                    var ctx = getContext("2d")
                                                    ctx.reset()
                                                    var cx = width / 2
                                                    var cy = height / 2
                                                    var r = cx - 4
                                                    var lw = 5
                                                    var startAngle = -Math.PI / 2

                                                    // Track
                                                    ctx.beginPath()
                                                    ctx.arc(cx, cy, r, 0, 2 * Math.PI)
                                                    ctx.lineWidth = lw
                                                    ctx.strokeStyle = trackColor
                                                    ctx.stroke()

                                                    // Fill
                                                    if (pct > 0) {
                                                        ctx.beginPath()
                                                        ctx.arc(cx, cy, r, startAngle, startAngle + 2 * Math.PI * pct)
                                                        ctx.lineWidth = lw
                                                        ctx.lineCap = "round"
                                                        ctx.strokeStyle = ringColor
                                                        ctx.stroke()
                                                    }
                                                }
                                            }

                                            // Percent text inside ring
                                            StyledText {
                                                anchors.centerIn: parent
                                                text: modelData.primary ? modelData.primary.percent_used + "" : "--"
                                                color: modelData.primary ? root.usageColor(modelData.primary.percent_used) : Theme.surfaceVariantText
                                                font.pixelSize: 13
                                                font.weight: Font.Bold
                                            }
                                        }

                                        // Info column
                                        Column {
                                            anchors.verticalCenter: parent.verticalCenter
                                            spacing: 2
                                            width: parent.width - 48 - 40 - Theme.spacingM * 2

                                            Row {
                                                spacing: Theme.spacingXS

                                                StyledText {
                                                    text: modelData.name
                                                    color: Theme.surfaceText
                                                    font.pixelSize: Theme.fontSizeMedium
                                                    font.weight: Font.Bold
                                                }

                                                StyledText {
                                                    text: modelData.id === root.activeProvider ? "\u2605" : ""
                                                    color: root.providerColors[modelData.id] || Theme.primary
                                                    font.pixelSize: Theme.fontSizeSmall
                                                    visible: text !== ""
                                                }
                                            }

                                            StyledText {
                                                text: {
                                                    if (modelData.error && !modelData.primary) return modelData.error
                                                    var parts = []
                                                    if (modelData.primary) parts.push(modelData.primary.label)
                                                    if (modelData.account && modelData.account.plan) parts.push(modelData.account.plan)
                                                    return parts.join(" \u00B7 ")
                                                }
                                                color: (modelData.error && !modelData.primary) ? Theme.error : Theme.surfaceVariantText
                                                font.pixelSize: Theme.fontSizeSmall
                                                elide: Text.ElideRight
                                                width: parent.width
                                            }

                                            StyledText {
                                                text: {
                                                    if (modelData.primary && modelData.primary.resets_at) {
                                                        return "Resets " + root.timeUntil(modelData.primary.resets_at)
                                                    }
                                                    return ""
                                                }
                                                color: Theme.surfaceVariantText
                                                font.pixelSize: Theme.fontSizeSmall - 2
                                                visible: text !== ""
                                            }
                                        }

                                        // Secondary mini ring
                                        Item {
                                            width: 34
                                            height: 34
                                            anchors.verticalCenter: parent.verticalCenter
                                            visible: !!modelData.secondary

                                            Canvas {
                                                anchors.fill: parent
                                                property real pct: modelData.secondary ? Math.min(modelData.secondary.percent_used, 100) / 100 : 0
                                                property color ringColor: modelData.secondary ? root.usageColor(modelData.secondary.percent_used) : Theme.surfaceContainerHighest
                                                property color trackColor: Theme.surfaceContainerHighest

                                                onPctChanged: requestPaint()
                                                onRingColorChanged: requestPaint()

                                                onPaint: {
                                                    var ctx = getContext("2d")
                                                    ctx.reset()
                                                    var cx = width / 2
                                                    var cy = height / 2
                                                    var r = cx - 3
                                                    var lw = 3.5
                                                    var startAngle = -Math.PI / 2

                                                    ctx.beginPath()
                                                    ctx.arc(cx, cy, r, 0, 2 * Math.PI)
                                                    ctx.lineWidth = lw
                                                    ctx.strokeStyle = trackColor
                                                    ctx.stroke()

                                                    if (pct > 0) {
                                                        ctx.beginPath()
                                                        ctx.arc(cx, cy, r, startAngle, startAngle + 2 * Math.PI * pct)
                                                        ctx.lineWidth = lw
                                                        ctx.lineCap = "round"
                                                        ctx.strokeStyle = ringColor
                                                        ctx.stroke()
                                                    }
                                                }
                                            }

                                            StyledText {
                                                anchors.centerIn: parent
                                                text: modelData.secondary ? modelData.secondary.percent_used + "" : ""
                                                color: modelData.secondary ? root.usageColor(modelData.secondary.percent_used) : Theme.surfaceVariantText
                                                font.pixelSize: 9
                                                font.weight: Font.Bold
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    popoutWidth: 340
    popoutHeight: 400
}
