import argparse
import json
import re
import subprocess
from pathlib import Path

from git import Repo

REPO_ROOT = Path(__file__).parent.parent
DEFAULT_MODEL = "claude-haiku-4.5"


def get_previous_version(repo):
    return (
        [t.name for t in repo.tags][-1]
        if repo.tags is not None and len(repo.tags) > 0
        else None
    )


def update_package_version(new_version):
    """
    Updates the 'version' key in a package.json file.

    Args:
        file_path (str): The path to the package.json file.
        new_version (str): The new version string to set.
    """
    file_path = REPO_ROOT / "package.json"
    try:
        with open(file_path, "r") as f:
            data = json.load(f)

        data["version"] = new_version

        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
    except FileNotFoundError:
        print(f"Error: package.json not found at {file_path}")
        raise
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in {file_path}")
        raise
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise


def insert_at_front_of_file(filename, new_content):
    """
    Inserts new_content at the very beginning of the specified file.

    Args:
        filename (str): The path to the file.
        new_content (str): The content to insert at the front.
                           Ensure it ends with a newline character if desired.
    """
    try:
        with open(filename, "r") as f:
            lines = f.readlines()

        lines.insert(0, new_content)

        with open(filename, "w") as f:
            f.writelines(lines)

    except FileNotFoundError:
        print(f"Error: File '{filename}' not found.")
    except Exception as e:
        print(f"An error occurred: {e}")


def extract_changelog_from_text(output_text: str) -> str:
    """
    Finds and extracts the first markdown changelog entry from a larger block of text,
    handling inconsistent prefixes and potential duplication.

    Args:
        output_text: The text containing conversational preamble and the changelog.

    Returns:
        The cleaned, extracted changelog markdown, or an empty string if not found.
    """
    match = re.search(r"## v\d+\.\d+\.\d+", output_text)
    if not match:
        return ""
    start_index = match.start()
    content_from_start = output_text[start_index:]
    content_after_first = content_from_start[match.end() - start_index :]
    next_match = re.search(r"## v\d+\.\d+\.\d+", content_after_first)
    if next_match:
        end_index = next_match.start() + (match.end() - start_index)
        changelog_content = content_from_start[:end_index]
    else:
        changelog_content = content_from_start

    formatted_lines = []
    for line in changelog_content.splitlines():
        formatted_lines.append(line.lstrip())
    changelog_content = "\n".join(formatted_lines)
    return changelog_content.replace("```", "").strip()


def get_changelog_entry(version: str, changelog_path: Path) -> str:
    with changelog_path.open("r") as f:
        changelog_content = f.read()
    pattern = rf"##\s*{re.escape(version)}\s*(.*?)\s*(##\s*v\d+\.\d+\.\d+|$)"
    match = re.search(pattern, changelog_content, re.DOTALL)
    if match:
        entry = match.group(0).strip()
        return entry
    else:
        raise ValueError(
            f"Changelog entry for version {version} not found in {changelog_path}"
        )


def generate_changelog_entry(version: str, repo: Repo) -> str:
    prompt = f"""
Examine the git history since the last tag ({get_previous_version(repo)}) and generate a new CHANGELOG entry for {version}.
The entry format should be consistent with the existing CHANGELOG.md file.
Do not output anything other than the new CHANGELOG entry.

For example, a perfect output looks like this:

## vX.Y.Z

### Fixed
- A bug fix.

### Improved
- An improvement.

Your output should be only the markdown, starting with `## {version}`.
    """
    cmd = [
        "copilot",
        "--model",
        DEFAULT_MODEL,
        "--prompt",
        prompt,
        "--allow-all-tools",
        "--allow-all-paths",
        "--silent",
        "--stream=off",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("Error running copilot:", result.stderr)
        raise RuntimeError("Copilot command failed")

    response = result.stdout.strip()
    return extract_changelog_from_text(response)


def main():
    parser = argparse.ArgumentParser("Release script")
    parser.add_argument("--version", type=str, required=True, help="Version to release")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode")
    parser.add_argument(
        "--no-tag",
        action="store_true",
        help="Do not create tag. Implies --no-push and --no-release",
    )
    parser.add_argument(
        "--no-push",
        action="store_true",
        help="Do not push to remote. Implies --no-release",
    )
    parser.add_argument(
        "--no-release", action="store_true", help="Do not create a GitHub release"
    )
    parser.add_argument(
        "--skip-gen",
        action="store_true",
        help="Do not generate changelog entry. Assumes the latest entry is correct.",
    )
    args = parser.parse_args()
    version = args.version
    dry_run = args.dry_run
    no_tag = args.no_tag
    no_push = args.no_push
    no_release = args.no_release
    skip_gen = args.skip_gen
    repo = Repo(REPO_ROOT)
    changelog_path = REPO_ROOT / "CHANGELOG.md"

    print(f"Releasing version: {version}")

    if skip_gen:
        changelog_entry = get_changelog_entry(version, changelog_path)
    else:
        changelog_entry = generate_changelog_entry(version, repo)

    if dry_run:
        print("Dry run mode - not making any changes.")
        print("Generated changelog entry:")
        print(changelog_entry)
        return

    if not skip_gen:
        insert_at_front_of_file(changelog_path, changelog_entry + "\n\n")
        print(f"Changelog updated at {changelog_path}")

    if no_tag:
        print("No-tag mode - not creating tag, pushing, or releasing.")
        return

    update_package_version(version.lstrip("v"))
    print(f"Updated package.json to version {version.lstrip('v')}")

    if no_push:
        print("No-push mode - not pushing to remote.")
        return

    origin = repo.remote(name="origin")

    repo.index.add([changelog_path, REPO_ROOT / "package.json"])
    repo.index.commit(f"ci: release {version}")
    origin.push()
    print("Pushed commit to remote.")

    repo.create_tag(path=version, message=changelog_entry)
    print(f"Created git tag {version}.")
    origin.push(version)
    print(f"Pushed new tag {version} to remote.")

    if no_release:
        print("No-release mode - not creating GitHub release.")
        return

    release_cmd = [
        "gh",
        "release",
        "create",
        version,
        "-t",
        version,
        "--notes-from-tag",
    ]
    res = subprocess.run(release_cmd)
    if res.returncode != 0:
        print("Error creating GitHub release.")
        return

    print(f"Created GitHub release for {version}.")


if __name__ == "__main__":
    main()
