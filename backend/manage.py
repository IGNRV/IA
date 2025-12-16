#!/usr/bin/env python
import os
import sys
from pathlib import Path

def main():
    base_dir = Path(__file__).resolve().parent
    try:
        from dotenv import load_dotenv
        load_dotenv(base_dir / ".env")
    except Exception:
        pass

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "localollama.settings")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)

if __name__ == "__main__":
    main()
