@echo off
echo ========================================
echo Brawlers Tavern - Data Updater
echo ========================================
echo.

REM Find the latest users and guilds files
for /f "delims=" %%i in ('dir /b /o-d data\users-*.json 2^>nul ^| findstr /r "users-[0-9].*\.json" ^| findstr /v /i "users\.json"') do (
    set "USERS_FILE=%%i"
    goto :found_users
)
:found_users

for /f "delims=" %%i in ('dir /b /o-d data\guilds-*.json 2^>nul ^| findstr /r "guilds-[0-9].*\.json" ^| findstr /v /i "guilds\.json"') do (
    set "GUILDS_FILE=%%i"
    goto :found_guilds
)
:found_guilds

if not defined USERS_FILE (
    echo ERROR: No users-*.json file found in data directory
    pause
    exit /b 1
)

if not defined GUILDS_FILE (
    echo ERROR: No guilds-*.json file found in data directory
    pause
    exit /b 1
)

echo Found latest files:
echo   Users:  %USERS_FILE%
echo   Guilds: %GUILDS_FILE%
echo.
echo Processing data...
echo.

python process_data.py "data\%USERS_FILE%" "data\%GUILDS_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Your website data is updated.
    echo Just refresh your browser to see changes.
    echo ========================================
) else (
    echo.
    echo ERROR: Processing failed. Check the error above.
)

echo.
pause
