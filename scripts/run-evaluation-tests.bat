@echo off
REM Script d'exécution des tests du module Évaluation (Windows)
REM Usage: run-evaluation-tests.bat [option]

setlocal enabledelayedexpansion

REM Configuration des couleurs
set "RESET=[0m"
set "BLUE=[0;34m"
set "GREEN=[0;32m"
set "RED=[0;31m"
set "YELLOW=[1;33m"

REM Répertoire du script
cd /d "%~dp0\.."

REM Afficher l'option d'aide
if "%1"=="" (
    call :show_help
    exit /b 0
)

if "%1"=="help" (
    call :show_help
    exit /b 0
)

REM Vérifier les prérequis
call :check_requirements

REM Exécuter l'option
if "%1"=="all" (
    call :run_all
) else if "%1"=="service" (
    call :run_service
) else if "%1"=="controller" (
    call :run_controller
) else if "%1"=="model" (
    call :run_model
) else if "%1"=="integration" (
    call :run_integration
) else if "%1"=="quick" (
    call :run_quick
) else if "%1"=="coverage" (
    call :run_coverage
) else if "%1"=="watch" (
    call :run_watch
) else if "%1"=="clean" (
    call :cleanup
) else if "%1"=="json" (
    call :run_json
) else (
    echo Erreur: Option non reconnue: %1
    call :show_help
    exit /b 1
)

exit /b 0

REM Fonctions
:show_help
echo.
echo ╔═══════════════════════════════════════════════════╗
echo ║   Tests du Module Evaluation - Script d'Execution║
echo ╚═══════════════════════════════════════════════════╝
echo.
echo Usage: run-evaluation-tests.bat [option]
echo.
echo Options disponibles:
echo   all              Tous les tests (760+ cas)
echo   service          Tests Service (230+ cas)
echo   controller       Tests Controleur (180+ cas)
echo   model            Tests Modele (150+ cas)
echo   integration      Tests Integration (200+ cas)
echo   quick            Tests rapides (sans integration)
echo   coverage         Rapport de couverture
echo   watch            Mode watch (relance auto)
echo   json             Export resultats en JSON
echo   clean            Nettoie les fichiers temporaires
echo   help             Affiche cette aide
echo.
echo Exemples:
echo   run-evaluation-tests.bat all
echo   run-evaluation-tests.bat service
echo   run-evaluation-tests.bat coverage
echo.
goto :eof

:check_requirements
echo Verification des prerequis...
where node >nul 2>nul
if errorlevel 1 (
    echo Erreur: Node.js n'est pas installe
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set nodever=%%i
echo [OK] Node.js %nodever%

where npm >nul 2>nul
if errorlevel 1 (
    echo Erreur: npm n'est pas installe
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set npmver=%%i
echo [OK] npm %npmver%

if not exist "node_modules" (
    echo Installation des dependances...
    call npm install --silent
)
echo [OK] Dependances OK
echo.
goto :eof

:run_all
echo.
echo Execution de TOUS les tests...
echo.
call npm test -- --verbose --colors
goto :eof

:run_service
echo.
echo Tests Unitaires du SERVICE (230+ cas)
echo.
call npm test -- evaluation.service.unit.test.js --verbose --colors
goto :eof

:run_controller
echo.
echo Tests Unitaires du CONTROLEUR (180+ cas)
echo.
call npm test -- evaluation.controller.unit.test.js --verbose --colors
goto :eof

:run_model
echo.
echo Tests Unitaires du MODELE (150+ cas)
echo.
call npm test -- evaluation.model.unit.test.js --verbose --colors
goto :eof

:run_integration
echo.
echo Tests d'INTEGRATION (200+ cas)
echo.
call npm test -- evaluation.integration.test.js --verbose --colors
goto :eof

:run_quick
echo.
echo Tests RAPIDES (sans integration)
echo.
call npm test -- evaluation.service.unit.test.js evaluation.controller.unit.test.js evaluation.model.unit.test.js --colors
goto :eof

:run_coverage
echo.
echo Generation du rapport de COUVERTURE...
echo.
call npm run test:coverage -- --colors
if exist "coverage\lcov-report\index.html" (
    echo.
    echo [OK] Rapport HTML genere: coverage\lcov-report\index.html
    echo Vous pouvez l'ouvrir dans un navigateur
)
goto :eof

:run_watch
echo.
echo Mode WATCH (relance automatique)
echo.
call npm run test:watch -- --colors
goto :eof

:run_json
echo.
echo Export resultats en JSON...
echo.
call npm test -- --json --outputFile=test-results.json
if exist "test-results.json" (
    echo.
    echo [OK] Resultats exportes: test-results.json
)
goto :eof

:cleanup
echo.
echo Nettoyage des fichiers temporaires...
if exist "coverage" rmdir /s /q coverage
if exist ".nyc_output" rmdir /s /q .nyc_output
if exist "test-results.json" del test-results.json
echo [OK] Nettoyage completed
goto :eof
