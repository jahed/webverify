<img src="web-extension/icons/icon.svg" width="128" align='right' alt='' />

# WebVerify

Verify web page authorship using OpenPGP. This is an experimental project.

## Installation

The Web Extension is currently in development and only works in Firefox.

```
git clone git@github.com:jahed/webverify.git
cd webverify
yarn install
```

## Usage

Create a `web-ext` Firefox Profile by going to `about:profiles`. Then run:

```
yarn start
```

This will launch Firefox using the `web-ext` profile with the extension
installed and will automatically reload it when there are any file changes.

`web-ext` makes config changes so using any other profile is not recommended.
Any changes you make within the `web-ext` window will not be saved. To make
permanent changes, launch the `web-ext` profile from `about:profiles`.

## Signing Webpages

For this example, we'll be signing an `index.html` page.

1. Generate a PGP key pair if you haven't already. Make sure it has a name and
   email attached.

```sh
gpg --full-generate-key
```

2. Upload your public key to https://keys.openpgp.org/ and verify the email
   address of the User ID you're planning to sign with.

3. Decide where you're going to place your signature. For example:

```
https://your.domain/path/to/index.html.sig
```

4. Add your signature path to your page:

```html
<link rel="signature" href="https://your.domain/path/to/index.html.sig" />
```

5. Sign the web page using `gpg` on any other OpenPGP tool to generate a
   detached armored signature.

```sh
gpg --detach-sign --armor --output "${sig_path}" "${html_path}"

# Check the signature.
cat "${sig_path}"

# It should look something like:
-----BEGIN PGP SIGNATURE-----

iQIzBAABCAAdFiEEAjotydKrjAeXmRALhHSlzvcvms0FAl+nWdoACgkQhHSlzvcv
ZlxVaS... and so on.
-----END PGP SIGNATURE-----
```

6. You're done!

### Dynamic Pages

For dynamic pages, the same rules apply. Fully render your page first including
the `<link />` tag, then generate the signature.

## Linking to Signed Webpages

To ensure a link to a webpage is signed by a specific author, assign the link a
key using a `<meta>` tag.

- `name` must be `webverify`
- `content` must be one of:

  - `[url_prefix] [iso_8601_date] [key_id]`
  - `[url_prefix] [key_id]`

You can use multiple tags for multiple links. The first `key_id` of the first
`url_prefix` that matches will be enforced.

The `iso_8601_date` is used for archive lookups if the author of the linked
webpage fails to match. It must be in
[ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) format, otherwise it will be
ignored.

### Example

```html
<meta name="webverify" content="https://your.domain/ 2020-11-25 AKEY1ID123" />
<meta name="webverify" content="https://example.com/users/bob BKEY2ID567" />
<meta name="webverify" content="https://example.com/ CKEY3ID890" />
```

In the above example `https://example.com/users/bob/timeline` will match
`BKEY2ID567` whereas `https://example.com/home` will match `CKEY3ID890`.

### Automation

The generation of `<meta>` tags can be automated by doing the following:

1. Find all the links on the webpage.
2. Fetch each page and extract the signature which contains a `key_id`
3. Assign the current date as `iso_8601_date`
4. Assign the link as `url_prefix`

Once initially fetched, `<meta>` data should not be automatically changed. If
your automation detects a `key_id` change, ensure any new authors are still
valid and verified.

## License

[MIT](LICENSE).
