import { Ajv } from "ajv";
export const schema = {
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
};
const ajv = new Ajv();
export const validate = ajv.compile(schema);
