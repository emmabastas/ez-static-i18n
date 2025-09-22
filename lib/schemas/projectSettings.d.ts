import type { JSONSchemaType } from "ajv";
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
export declare const schema: JSONSchemaType<ProjectSettings>;
export declare const validate: import("ajv").ValidateFunction<ProjectSettings>;
