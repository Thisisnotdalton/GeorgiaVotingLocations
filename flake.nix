{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells = {
          default = pkgs.mkShell {
            packages = [
                pkgs.python3
                pkgs.python3Packages.numpy
                pkgs.python3Packages.pandas
                pkgs.uv
                pkgs.stdenv.cc.cc.lib
            ];
          };
        };
      }
    );
}
