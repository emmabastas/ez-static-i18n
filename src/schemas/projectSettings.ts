// @ts-nocheck
import { Ajv } from "ajv"
import type { JSONSchemaType } from "ajv"

export interface ProjectSettings {
  distDir: string;
  sourceLanguage: string;
  targetLanguages: string[];
  contentSelector: string;
  existingTranslations: {
    [k: string]: {
      sourcePhrase: string;
      translatedPhrases: {
        [k: string]: string;
      };
    };
  };
}


export const schema: JSONSchemaType<ProjectSettings> = {
    "type": "object",
    "properties": {
        "distDir": {
            "type": "string"
        },
        "sourceLanguage": {
            "type": "string"
        },
        "targetLanguages": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "contentSelector": {
            "type": "string"
        },
        "existingTranslations": {
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "sourcePhrase": {
                        "type": "string"
                    },
                    "translatedPhrases": {
                        "type": "object",
                        "additionalProperties": {
                            "type": "string"
                        }
                    }
                },
                "required": [
                    "sourcePhrase",
                    "translatedPhrases"
                ],
                "additionalProperties": false
            }
        }
    },
    "required": [
        "distDir",
        "sourceLanguage",
        "targetLanguages",
        "contentSelector",
        "existingTranslations"
    ],
    "additionalProperties": false
}

const ajv = new Ajv()
export const validate = ajv.compile(schema)
//export const serialize = ajv.compileSerializer(schema)
//export const parse = ajv.compileParser(schema)
