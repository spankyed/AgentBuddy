# Homebrew formula for the `apack` pack CLI (@apack/cli on npm).
# Unreleased: publish @apack/cli first, add the actual tarball's SHA-256, remove
# disable!, and verify installation before copying this formula into the tap.
class Apack < Formula
  desc "Scaffold, build, test and release apack packs"
  homepage "https://apack.dev"
  url "https://registry.npmjs.org/@apack/cli/-/cli-0.1.0.tgz"
  # sha256 must be set from the published apack tarball; the old package's hash is invalid.
  license "MIT"

  disable! date: "2026-10-10", because: "the renamed CLI has not been released"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/apack --version").strip
  end
end
