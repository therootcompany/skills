#!/bin/sh
# Recursively download a website section using wget
# Downloads same-domain resources under a given path
#
# Version: 1.0.0
# When updating this script, bump the version number above.

set -eu

# Version info
g_version="1.0.0"

# Show help
show_help() {
    cat << 'EOF'
Usage: website-download-recursive.sh [OPTIONS] <base-url> [output-dir]

Recursively download a website section using wget.
Downloads same-domain resources under the given path.

ARGUMENTS:
    base-url        Starting URL to download
    output-dir      Output directory (default: ./downloaded)

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    --dry-run           Show wget command without executing
    --limit-domain      Only download from same domain (default: yes)
    --limit-path        Only download under base path (default: yes)
    --depth N           Maximum recursion depth (default: 5)
    --wait N            Wait N seconds between requests (default: 1)
    --no-images         Skip image downloads
    --no-css            Skip CSS downloads
    --convert-links     Convert links for local viewing
    --mirror            Mirror mode (preserve structure, all files)

EXAMPLES:
    # Download docs section
    website-download-recursive.sh https://docs.example.com/api ./docs

    # Mirror entire site
    website-download-recursive.sh --mirror https://example.com ./mirror

    # Preview command
    website-download-recursive.sh --dry-run https://docs.example.com/api

    # Respectful crawling
    website-download-recursive.sh --wait 2 --depth 3 https://docs.example.com/api

OUTPUT:
    Creates directory structure mirroring the website.
    HTML files are downloaded for offline viewing (if --convert-links).

DEPENDENCIES:
    wget

NOTES:
    Respects robots.txt by default.
    Uses --adjust-extension to save .html files properly.
EOF
}

show_version() {
    printf '%s version %s\n' "website-download-recursive.sh" "$g_version"
    printf 'Recursively download website sections with wget\n'
}

# Check dependencies
check_deps() {
    if ! command -v wget >/dev/null 2>&1; then
        printf 'Error: wget is required\n' >&2
        printf 'Install with: webi wget OR apt-get install wget\n' >&2
        exit 1
    fi
}

# Main function
main() {
    # Defaults
    b_base_url=""
    b_output_dir="./downloaded"
    b_dry_run=false
    b_limit_domain=true
    b_limit_path=true
    b_depth=5
    b_wait=1
    b_no_images=false
    b_no_css=false
    b_convert_links=false
    b_mirror=false

    # Parse arguments
    while test $# -gt 0; do
        b_arg="$1"
        shift

        case "$b_arg" in
            -h | --help | -help | help)
                show_help
                exit 0
                ;;
            -v | --version | -version | version)
                show_version
                exit 0
                ;;
            --dry-run)
                b_dry_run=true
                ;;
            --limit-domain)
                b_limit_domain=true
                ;;
            --no-limit-domain)
                b_limit_domain=false
                ;;
            --limit-path)
                b_limit_path=true
                ;;
            --no-limit-path)
                b_limit_path=false
                ;;
            --depth)
                if test $# -gt 0; then
                    b_depth="$1"
                    shift
                else
                    printf 'Error: --depth requires an argument\n' >&2
                    exit 1
                fi
                ;;
            --wait)
                if test $# -gt 0; then
                    b_wait="$1"
                    shift
                else
                    printf 'Error: --wait requires an argument\n' >&2
                    exit 1
                fi
                ;;
            --no-images)
                b_no_images=true
                ;;
            --no-css)
                b_no_css=true
                ;;
            --convert-links)
                b_convert_links=true
                ;;
            --mirror)
                b_mirror=true
                ;;
            -*)
                printf 'Error: Unknown option: %s\n' "$b_arg" >&2
                printf 'Try --help for usage information\n' >&2
                exit 1
                ;;
            *)
                if test -z "$b_base_url"; then
                    b_base_url="$b_arg"
                elif test -z "$b_output_dir"; then
                    b_output_dir="$b_arg"
                else
                    printf 'Error: Too many arguments\n' >&2
                    exit 1
                fi
                ;;
        esac
    done

    # Validate
    if test -z "$b_base_url"; then
        printf 'Error: base-url is required\n' >&2
        show_help >&2
        exit 1
    fi

    check_deps

    # Build wget options
    b_wget_opts=""

    # Recursive download
    b_wget_opts="$b_wget_opts --recursive"

    # Level/depth
    if test -n "$b_depth"; then
        b_wget_opts="$b_wget_opts --level=$b_depth"
    fi

    # Domain limits
    if test "$b_limit_domain" = true; then
        b_wget_opts="$b_wget_opts --domains=$(printf '%s' "$b_base_url" | sed -E 's|^https?://||' | cut -d/ -f1)"
    fi

    if test "$b_limit_path" = true; then
        b_wget_opts="$b_wget_opts --no-parent"
    fi

    # Wait between requests (be nice)
    if test -n "$b_wait" && test "$b_wait" -gt 0; then
        b_wget_opts="$b_wget_opts --wait=$b_wait"
    fi

    # Reject patterns
    b_rejects=""

    if test "$b_no_images" = true; then
        b_rejects="$b_rejects -R gif,jpg,jpeg,png,svg,webp,bmp,ico"
    fi

    if test "$b_no_css" = true; then
        b_rejects="$b_rejects -R css"
    fi

    # Page requisites (get CSS, images for pages we download)
    if test "$b_mirror" = true; then
        b_wget_opts="$b_wget_opts --page-requisites"
    fi

    # Adjust extension (save as .html)
    b_wget_opts="$b_wget_opts --adjust-extension"

    # Convert links for offline viewing
    if test "$b_convert_links" = true; then
        b_wget_opts="$b_wget_opts --convert-links"
    fi

    # Output directory
    mkdir -p "$b_output_dir"
    b_wget_opts="$b_wget_opts --directory-prefix=$b_output_dir"

    # Other useful options
    b_wget_opts="$b_wget_opts --no-clobber"           # Don't overwrite existing
    b_wget_opts="$b_wget_opts --backup-converted"     # Keep original when converting
    b_wget_opts="$b_wget_opts --content-disposition"  # Respect Content-Disposition

    # Respect robots.txt
    b_wget_opts="$b_wget_opts --execute robots=off"

    # User agent
    b_wget_opts="$b_wget_opts --user-agent='Mozilla/5.0 (compatible; DownloadBot/1.0)'"

    # Build command
    b_cmd="wget $b_wget_opts $b_rejects '$b_base_url'"

    if test "$b_dry_run" = true; then
        printf 'Dry run - would execute:\n'
        printf '%s\n' "$b_cmd"
        exit 0
    fi

    printf 'Starting download...\n'
    printf 'URL: %s\n' "$b_base_url"
    printf 'Output: %s\n' "$b_output_dir"
    printf 'Depth: %s\n' "$b_depth"
    printf 'Wait: %s seconds\n' "$b_wait"
    printf '\n'

    # shellcheck disable=SC2086
    eval $b_cmd

    printf '\nDownload complete. Files saved to: %s\n' "$b_output_dir"
}

main "$@"
