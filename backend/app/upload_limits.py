"""Bound incoming multipart bodies before Starlette spools them to disk."""
from fastapi import HTTPException
from starlette.responses import JSONResponse
from .config import settings
class UploadLimitMiddleware:
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        upload=scope["type"]=="http" and scope.get("method")=="POST" and scope.get("path","").startswith("/api/v1/evidence")
        if not upload:return await self.app(scope,receive,send)
        limit=settings.max_upload_bytes+1024*1024 # bounded multipart envelope
        detail={"code":"upload_too_large","message":"Evidence must be 100 MB or smaller."}
        headers=dict(scope.get("headers",[]))
        try:declared=int(headers.get(b"content-length",b"0"))
        except ValueError:declared=0
        if declared>limit:
            return await JSONResponse({"error":detail,"detail":detail},status_code=413)(scope,receive,send)
        received=0
        async def bounded_receive():
            nonlocal received
            message=await receive()
            if message["type"]=="http.request":
                received+=len(message.get("body",b""))
                if received>limit:raise HTTPException(413,detail=detail)
            return message
        await self.app(scope,bounded_receive,send)
