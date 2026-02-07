import QtQuick
import qs.Common
import qs.Widgets
import qs.Modules.Plugins

PluginSettings {
    pluginId: "codexBar"

    StyledText {
        width: parent.width
        text: "CodexBar Settings"
        font.pixelSize: Theme.fontSizeLarge
        font.weight: Font.Bold
        color: Theme.surfaceText
    }

    StyledText {
        width: parent.width
        text: "Monitor AI coding assistant usage from your status bar. Auto-detects which provider you're using based on the focused window."
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.surfaceVariantText
        wrapMode: Text.WordWrap
    }

    StringSetting {
        settingKey: "codexBarPath"
        label: "CodexBar Path"
        description: "Absolute path to the codexbar-linux repo"
        placeholder: "/home/gabriel/Projects/Personal/codexbar-linux"
        defaultValue: "/home/gabriel/Projects/Personal/codexbar-linux"
    }

    SelectionSetting {
        settingKey: "refreshInterval"
        label: "Refresh Interval"
        description: "How often to fetch usage data from provider APIs"
        options: [
            {label: "1 minute", value: "60"},
            {label: "2 minutes", value: "120"},
            {label: "5 minutes", value: "300"}
        ]
        defaultValue: "120"
    }

    SelectionSetting {
        settingKey: "detectInterval"
        label: "Window Detection Interval"
        description: "How often to check which AI tool is focused (via niri IPC)"
        options: [
            {label: "3 seconds", value: "3"},
            {label: "5 seconds", value: "5"},
            {label: "10 seconds", value: "10"}
        ]
        defaultValue: "5"
    }

    ToggleSetting {
        settingKey: "autoDetect"
        label: "Auto-detect Active Provider"
        description: "Automatically show the provider matching the focused window in the bar pill"
        defaultValue: true
    }
}
