#!/usr/bin/env -S bash -euo pipefail
#
# Signs a directory's HTML files with a given key.
#

function print_usage {
  echo "Usage: ./sign.sh <key_id> <directory>"
  echo "<key_id> must be exist and should be 16-characters."
  echo "<directory> must exist."
}

key_id="${1}"
html_dir="${2}"

echo "Signing as:"
set +e
gpg --list-secret-keys --keyid-format LONG ${key_id}
key_exists=$?
set -e
if [[ "${key_exists}" != "0" ]]; then
  print_usage
  exit 1
fi

if [[ ! -d "${html_dir}" ]]; then
  print_usage
  exit 2
fi

echo
echo 'Signing HTML files'
for i in $(find "${html_dir}" -type f -name '*.html'); do
  html_path="${i}"
  sig_path="${i}.sig"

  if [[ -f "${sig_path}" ]]; then
    set +e
    gpg --quiet --verify "${sig_path}" "${html_path}" 2>/dev/null
    verified=$?
    set -e
    if [[ "${verified}" == "0" ]]; then
      continue
    fi
    echo "Signing: ${html_path}"
  fi

  gpg --batch --yes --quiet \
    --detach-sign \
    --local-user "${key_id}" \
    --armor \
    --output "${sig_path}" \
    "${html_path}"
done

echo
echo "Done."
