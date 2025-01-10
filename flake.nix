{
  description = "icloudpd-ui development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js and npm
            nodejs_20
            # Python and package management
            python3
            uv
            # Build tools
            pkg-config
            # Required for node-pty
            gnumake
            gcc
            # Pre-commit and formatting tools
            pre-commit
            ruff
          ];

          shellHook = ''
            echo "icloudpd-ui development environment"
            echo "Node.js $(node --version)"
            echo "npm $(npm --version)"

            # Initialize pre-commit hooks
            pre-commit install
          '';
        };
      }
    );
}
