{
  description = "Flake for diamond-forge.";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, ... }@inputs: inputs.utils.lib.eachDefaultSystem (system:
    let
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShell = pkgs.mkShell {
        packages = with pkgs; [
          deno
        ];

        shellHook = ''
          # Don't prompt for updates as Deno is managed by Nix
          export DENO_NO_UPDATE_CHECK="1";
          # Use macOS keychain for certificates
          export DENO_TLS_CA_STORE=system
        '';
      };
    }
  );
}
