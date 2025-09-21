{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
}:

buildNpmPackage (finalAttrs: {
  pname = "ez-static-i18n-server";
  version = "0.1.0";

  src = fetchFromGitHub {
    owner = "emmabastas";
    repo = "ez-static-i18n";
    tag = "v${finalAttrs.version}";
    hash = "sha256-BR+ZGkBBfd0dSQqAvujsbgsEPFYw/ThrylxUbOksYxM=";
  };

  npmDepsHash = "sha256-tuEfyePwlOy2/mOPdXbqJskO6IowvAP4DWg8xSZwbJw=";

  npmPackFlags = [ "--ignore-scripts" ];

  npmBuildScript = "views:build";

  NODE_OPTIONS = "--experimental-strip-types";

  meta = {
    description = "Let non-technical people contribute to i18n for static websites.";
    homepage = "https://github.com/emmabastas/ez-static-i18n#readme";
    license = lib.licenses.agpl3OrLater;
    maintainers = with lib.maintainers; [ emmabastas ];
  };
})
