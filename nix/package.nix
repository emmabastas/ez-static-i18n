{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
}:

buildNpmPackage (finalAttrs: {
  pname = "ez-static-i18n-server";
  version = "0.1.2";

  src = fetchFromGitHub {
    owner = "emmabastas";
    repo = "ez-static-i18n";
    tag = "v${finalAttrs.version}";
    hash = "sha256-q6cFRpB/u9r+f4gX+zaHd2yuE0SigtEmW6KtfwFK+RA=";
  };

  npmDepsHash = "sha256-Ne18hDkk7jg4kqjhke2EsCCsgt6xwZb0s4Q7f7kyNg0=";

  npmPackFlags = [ "--ignore-scripts" ];

  npmBuildScript = "build";

  forceGitDeps = true;

  makeCacheWritable = true;

  meta = {
    description = "Let non-technical people contribute to i18n for static websites.";
    homepage = "https://github.com/emmabastas/ez-static-i18n#readme";
    license = lib.licenses.agpl3Plus;
    maintainers = with lib.maintainers; [
      {
        email = "emma.bastas@protonmail.com";
        matrix = "@emmabastas:matrix.org";
        github = "emmabastas";
        githubId = 22533224;
        name = "Emma Bastås";
      }
    ];
  };
})
