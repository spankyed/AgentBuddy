import type { SettingsDefinition } from '@apackdev/sdk/framework';

/** The host owns app preferences, whether or not any pack is installed. */
export const appSettingsDefinition: SettingsDefinition = {
  "title": "App",
  "description": "Host-owned application preferences.",
  "defaults": {
    "hotkeys": {
      "switchPluginUp": {
        "key": "ArrowUp",
        "modifiers": [
          "cmd",
          "option"
        ]
      },
      "switchPluginDown": {
        "key": "ArrowDown",
        "modifiers": [
          "cmd",
          "option"
        ]
      },
      "toggleInspectionPanel": {
        "key": "b",
        "modifiers": [
          "cmd"
        ]
      }
    },
    "personal": {},
    "projects": []
  },
  "schema": {
    "type": "object",
    "properties": {
      "hotkeys": {
        "$ref": "#/definitions/ApplicationHotkeys"
      },
      "personal": {
        "$ref": "#/definitions/AppPersonalInfo"
      },
      "projects": {
        "type": "array",
        "items": {
          "$ref": "#/definitions/AppProject"
        }
      }
    },
    "required": [
      "hotkeys",
      "personal",
      "projects"
    ],
    "additionalProperties": false,
    "$schema": "http://json-schema.org/draft-07/schema#",
    "definitions": {
      "KeyboardShortcut": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string"
          },
          "modifiers": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "global": {
            "type": "boolean"
          }
        },
        "required": [
          "key",
          "modifiers"
        ],
        "additionalProperties": false
      },
      "CustomHotkey": {
        "type": "object",
        "properties": {
          "key": {
            "type": "string"
          },
          "modifiers": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "global": {
            "type": "boolean"
          },
          "id": {
            "type": "string"
          },
          "eventName": {
            "type": "string"
          }
        },
        "required": [
          "key",
          "modifiers",
          "id",
          "eventName"
        ],
        "additionalProperties": false
      },
      "ApplicationHotkeys": {
        "type": "object",
        "properties": {
          "switchPluginUp": {
            "$ref": "#/definitions/KeyboardShortcut"
          },
          "switchPluginDown": {
            "$ref": "#/definitions/KeyboardShortcut"
          },
          "toggleInspectionPanel": {
            "$ref": "#/definitions/KeyboardShortcut"
          },
          "custom": {
            "type": "array",
            "items": {
              "$ref": "#/definitions/CustomHotkey"
            }
          }
        },
        "required": [],
        "additionalProperties": false
      },
      "AppAddress": {
        "type": "object",
        "properties": {
          "street": {
            "type": "string"
          },
          "street2": {
            "type": "string"
          },
          "city": {
            "type": "string"
          },
          "state": {
            "type": "string"
          },
          "postalCode": {
            "type": "string"
          },
          "country": {
            "type": "string"
          }
        },
        "required": [
          "street",
          "city",
          "state",
          "postalCode",
          "country"
        ],
        "additionalProperties": false
      },
      "AppPersonalInfo": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "phoneNumber": {
            "type": "string"
          },
          "address": {
            "$ref": "#/definitions/AppAddress"
          }
        },
        "required": [],
        "additionalProperties": false
      },
      "AppProject": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "directories": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "color": {
            "type": "string"
          }
        },
        "required": [
          "name",
          "directories",
          "color"
        ],
        "additionalProperties": false
      }
    }
  }
};
