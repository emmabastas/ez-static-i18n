import { Ajv } from "ajv";
export const schema = {
    "type": "object",
    "properties": {
        "port": {
            "type": "number"
        },
        "cookieSecret": {
            "type": "string"
        },
        "redis": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string"
                }
            },
            "required": [
                "url"
            ],
            "additionalProperties": false
        }
    },
    "required": [
        "port",
        "cookieSecret",
        "redis"
    ],
    "additionalProperties": false
};
const ajv = new Ajv();
export const validate = ajv.compile(schema);
