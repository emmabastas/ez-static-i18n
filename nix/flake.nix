# Thank you https://www.gopaddy.ch/en/posts/b14028e/
{
  description = "A simple flake adding ez-static-i18n as a package an a service";

  outputs = { self, nixpkgs, nix, }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        # Not sure it works on OSX but plz try.
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;

      overlayList = [ self.overlays.default ];

      pkgsBySystem = forEachSystem (
        system:
        import nixpkgs {
          inherit system;
          overlays = overlayList;
        }
      );

    in
    rec {

      overlays.default = final: prev: { ez-static-i18n-server = final.callPackage ./package.nix { }; };

      packages = forEachSystem (system: {
        ez-static-i18n-server = pkgsBySystem.${system}.ez-static-i18n-server;
        default = pkgsBySystem.${system}.ez-static-i18n-server;
      });

      #nixosModules = import ./nixos-modules { overlays = overlayList; };
    };
}
