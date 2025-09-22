{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
}:

buildNpmPackage (finalAttrs: {
  pname = "ez-static-i18n-server";
  version = "0.1.6";

  src = fetchFromGitHub {
    owner = "emmabastas";
    repo = "ez-static-i18n";
    tag = "v${finalAttrs.version}";
    hash = "sha256-jSKYpjSuHVutsgr3TTYM0AgKS+QI0SqUIl0lw62NOVU=";
  };

  npmDepsHash = "sha256-3KpVjtJErFp6joCgtf/3evqB8yCfEO+dra88GNEh9LM=";

  npmPackFlags = [ "--ignore-scripts" ];

  # npmBuildScript = "build";
  dontNpmBuild = true;

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
