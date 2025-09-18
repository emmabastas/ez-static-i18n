{
  description = "";

  inputs = {
    my-nixpkgs.url = "git+ssh://gitea@tea.notadev.net:3243/emmabastas/my-nixpkgs.git";
    nixpkgs.follows = "my-nixpkgs/nixpkgs-unstable";
    flake-utils.follows = "my-nixpkgs/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem
      (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs
              nodePackages."typescript"
              nodePackages."typescript-language-server"
              jtd-codegen
              sqlite
              sqlitebrowser
            ];
            shellHook = ''
              export PATH="$PWD/frontend/node_modules/.bin/:$PATH"
            '';
          };
        }
      );
}
