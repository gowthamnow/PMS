import logging
from typing import Any, Optional
import httpx

from app.config import settings

logger = logging.getLogger("gitea_service")


class GiteaClient:
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None):
        self.base_url = (base_url or settings.GITEA_BASE_URL).rstrip("/")
        self.token = token if token is not None else settings.GITEA_ADMIN_TOKEN
        self.headers = {
            "Authorization": f"token {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def get_repo(self, owner: str, repo: str) -> dict:
        """GET /api/v1/repos/{owner}/{repo}"""
        url = f"{self.base_url}/api/v1/repos/{owner}/{repo}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=self.headers)
                if response.status_code == 200:
                    data = response.json()
                    return data if isinstance(data, dict) else {}
                logger.error(f"Gitea get_repo failed with status {response.status_code}: {response.text}")
                return {}
        except Exception as exc:
            logger.error(f"Error fetching repo {owner}/{repo}: {exc}")
            return {}

    async def get_commits(self, owner: str, repo: str, page: int = 1, limit: int = 20) -> list:
        """GET /api/v1/repos/{owner}/{repo}/git/commits?page=&limit="""
        params = {"page": page, "limit": limit}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Primary Gitea commits endpoint
                url = f"{self.base_url}/api/v1/repos/{owner}/{repo}/commits"
                response = await client.get(url, headers=self.headers, params=params)
                if response.status_code == 200:
                    data = response.json()
                    return data if isinstance(data, list) else []

                # Fallback to /git/commits endpoint if needed
                git_url = f"{self.base_url}/api/v1/repos/{owner}/{repo}/git/commits"
                git_resp = await client.get(git_url, headers=self.headers, params=params)
                if git_resp.status_code == 200:
                    data = git_resp.json()
                    return data if isinstance(data, list) else []

                logger.error(f"Gitea get_commits failed with status {response.status_code}")
                return []
        except Exception as exc:
            logger.error(f"Error fetching commits for {owner}/{repo}: {exc}")
            return []

    async def get_branches(self, owner: str, repo: str) -> list:
        """GET /api/v1/repos/{owner}/{repo}/branches"""
        url = f"{self.base_url}/api/v1/repos/{owner}/{repo}/branches"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=self.headers)
                if response.status_code == 200:
                    data = response.json()
                    return data if isinstance(data, list) else []
                logger.error(f"Gitea get_branches failed with status {response.status_code}")
                return []
        except Exception as exc:
            logger.error(f"Error fetching branches for {owner}/{repo}: {exc}")
            return []

    async def get_pull_requests(self, owner: str, repo: str, state: str = "open") -> list:
        """GET /api/v1/repos/{owner}/{repo}/pulls?state=&type=comment"""
        url = f"{self.base_url}/api/v1/repos/{owner}/{repo}/pulls"
        params = {"state": state, "type": "comment"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=self.headers, params=params)
                if response.status_code == 200:
                    data = response.json()
                    return data if isinstance(data, list) else []
                logger.error(f"Gitea get_pull_requests failed with status {response.status_code}")
                return []
        except Exception as exc:
            logger.error(f"Error fetching pull requests for {owner}/{repo}: {exc}")
            return []

    async def verify_repo_exists(self, repo_full_name: str) -> bool:
        """Try to GET the repo, return True if 200, False if 404 or on error"""
        parts = repo_full_name.split("/")
        if len(parts) != 2:
            return False
        owner, repo = parts
        url = f"{self.base_url}/api/v1/repos/{owner}/{repo}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=self.headers)
                return response.status_code == 200
        except Exception as exc:
            logger.error(f"Error verifying repo {repo_full_name}: {exc}")
            return False

    async def create_webhook(self, owner: str, repo: str, webhook_url: str, secret: str) -> dict:
        """
        POST /api/v1/repos/{owner}/{repo}/hooks
        config: {url, content_type: json, secret}
        events: [push, pull_request, create, delete]
        """
        url = f"{self.base_url}/api/v1/repos/{owner}/{repo}/hooks"
        payload = {
            "type": "gitea",
            "config": {
                "url": webhook_url,
                "content_type": "json",
                "secret": secret,
            },
            "events": ["push", "pull_request", "create", "delete"],
            "active": True,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, headers=self.headers, json=payload)
                if response.status_code in (200, 201):
                    data = response.json()
                    return data if isinstance(data, dict) else {}
                logger.error(
                    f"Gitea create_webhook failed with status {response.status_code}: {response.text}"
                )
                return {}
        except Exception as exc:
            logger.error(f"Error creating webhook for {owner}/{repo}: {exc}")
            return {}


gitea_client = GiteaClient()
