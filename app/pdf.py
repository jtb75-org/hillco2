"""WeasyPrint helpers."""


# Cap on a single data: URI passed through to WeasyPrint. Defends against
# pathological large embedded images / fonts triggering OOM during PDF
# render. Templates today escape user input; this cap is defense-in-depth
# for a future change that ever marks user content `|safe`.
MAX_DATA_URI_BYTES = 5 * 1024 * 1024


def safe_url_fetcher(url: str, timeout: int = 10, ssl_context=None):
    """A WeasyPrint url_fetcher that only allows data: URIs.

    Rejects http(s)/file/ftp/etc so that no template change (including a
    future `|safe` regression that lets a `<img src="https://attacker">`
    slip into the rendered HTML) can trigger an outbound fetch during
    PDF generation. Without this lockdown, WeasyPrint would happily
    resolve such URLs server-side, turning template injection into SSRF.
    """
    if url.startswith("data:"):
        if len(url) > MAX_DATA_URI_BYTES:
            raise ValueError(
                f"WeasyPrint refused oversized data: URI ({len(url)} bytes, "
                f"max {MAX_DATA_URI_BYTES})"
            )
        from weasyprint import default_url_fetcher

        return default_url_fetcher(url)
    raise ValueError(
        f"WeasyPrint refused to fetch external resource: {url[:80]}"
    )
