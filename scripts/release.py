import argparse
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


def main():
    parser = argparse.ArgumentParser("Release script")
    parser.add_argument("--version", type=str, required=True, help="Version to release")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode")
    parser.add_argument("--no-push", action="store_true", help="Do not push tag to remote. Implies --no-release")
    parser.add_argument("--no-release", action="store_true", help="Do not create a GitHub release")
    args = parser.parse_args()
    version = args.version
    dry_run = args.dry_run
    no_push = args.no_push
    no_release = args.no_release
    repo = Repo(REPO_ROOT)

    print(f"Releasing version: {version}")

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
        return

    response = result.stdout.strip()
    changelog_entry = extract_changelog_from_text(response)
    if dry_run:
        print("Dry run mode - not making any changes.")
        print("Generated changelog entry:")
        print(changelog_entry)
        return

    changelog_path = REPO_ROOT / "CHANGELOG.md"
    insert_at_front_of_file(changelog_path, changelog_entry + "\n\n")

    print(f"Changelog updated at {changelog_path}")

    repo.create_tag(path=version, message=changelog_entry)

    if no_push:
        print("No-push mode - not pushing tag to remote.")
        return
    origin = repo.remote(name="origin")
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
