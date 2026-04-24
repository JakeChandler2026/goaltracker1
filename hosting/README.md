# Local Hosting

This project can be hosted directly on this Windows machine without installing Node, Python, or IIS.

## Start the site

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\hosting\start-site.ps1
```

The site will be available at:

```text
http://localhost:8080/
```

## Stop the site

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\hosting\stop-site.ps1
```

## Notes

- The server is a simple PowerShell static file host.
- It serves the current project folder directly.
- The running process id is stored in `hosting/site-server.pid`.
