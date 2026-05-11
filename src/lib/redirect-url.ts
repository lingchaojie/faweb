export function appRedirectUrl(request: Request, pathname: string) {
  if (process.env.APP_ORIGIN) {
    return new URL(pathname, process.env.APP_ORIGIN);
  }

  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (url.hostname === "0.0.0.0" && host) {
    url.host = host;
  }

  return new URL(pathname, url);
}
