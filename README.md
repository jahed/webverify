# Web Verify

Verify web pages authorship using OpenPGP. This is an experimental project.

## Installation

The Web Extension is currently in development and only works in Firefox.

```
git clone git@github.com:jahed/web-verify.git
cd web-verify
yarn install
```

## Usage

Create a `web-ext` Firefox Profile by going to `about:profiles`. Then run:

```
yarn web-ext run
```

This will launch Firefox using the `web-ext` profile with the extension
installed and will automatically reload it when there are any file changes.

`web-ext` makes config changes so using any other profile is not recommended.
Any changes you make within the `web-ext` window will not be saved. To make
permanent changes, launch the `web-ext` profile from `about:profiles`.

## Signing Webpages

For this example, we'll be signing an `index.html` page.

1. Generate a PGP key pair if you haven't already.

2. Add your public key to https://keys.openpgp.org/ and verify the email address
   of the User ID you're planning to sign with.

3. Decide where you're going to place your signature. For example:

```
https://your.domain/path/to/index.html.sig
```

4. Add your signature path to your page:

```html
<link rel="signature" href="https://your.domain/path/to/detached.sig" />
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

## License

[MIT](LICENSE).
