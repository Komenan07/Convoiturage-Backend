# Test de l'API d'inscription avec PowerShell

$BASE_URL = "http://localhost:3000"
$API_URL = "$BASE_URL/api/auth/inscription"

# Payload de test pour l'inscription
$payload = @{
    nom = "Test"
    prenom = "Utilisateur"
    email = "test.inscription@example.com"
    motDePasse = "MotDePasse123"
    telephone = "0701234567"
} | ConvertTo-Json

Write-Host "🧪 Test de l'API d'inscription..." -ForegroundColor Yellow
Write-Host "📤 Payload envoyé:" -ForegroundColor Cyan
Write-Host $payload -ForegroundColor Gray

try {
    # Test de la route de santé d'abord
    Write-Host "`n🏥 Test de la route de santé..." -ForegroundColor Yellow
    $healthResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/health" -Method Get
    Write-Host "✅ Route de santé accessible" -ForegroundColor Green
    Write-Host "📊 Réponse:" -ForegroundColor Cyan
    $healthResponse | ConvertTo-Json -Depth 3

    # Test de l'inscription
    Write-Host "`n🧪 Test de l'inscription..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri $API_URL -Method Post -Body $payload -ContentType "application/json"
    
    Write-Host "✅ Inscription réussie !" -ForegroundColor Green
    Write-Host "📄 Réponse:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 3
    
} catch {
    Write-Host "❌ Erreur lors du test:" -ForegroundColor Red
    Write-Host "📊 Statut:" $_.Exception.Response.StatusCode.value__ -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "📄 Réponse d'erreur:" -ForegroundColor Red
        Write-Host $responseBody -ForegroundColor Gray
    } else {
        Write-Host "💥 Erreur:" $_.Exception.Message -ForegroundColor Red
    }
}

Write-Host "`n✨ Test terminé" -ForegroundColor Green
