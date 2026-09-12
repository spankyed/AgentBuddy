# Homebrew formula for the `abuddy` pack CLI (@abuddy/cli on npm).
# After each package release, set `url` to the new version's tarball and `sha256` to its
# checksum (`npm pack @abuddy/cli@<version>` reproduces the published tarball), then copy
# this file into the tap.
class Abuddy < Formula
  desc "Scaffold, build, test and release AgentBuddy packs"
  homepage "https://github.com/spankyed/AgentBuddy"
  url "https://registry.npmjs.org/@abuddy/cli/-/cli-0.1.0.tgz"
  sha256 "d0935be52a4f79fe537ceb40fcc695641741a9c54cc21739b95bbf69669b4c00"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/abuddy --version").strip
  end
end
