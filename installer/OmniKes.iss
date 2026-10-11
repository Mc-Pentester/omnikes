#define MyAppName "OmniKès"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "OmniKès"
#define MyAppExeName "OmniKesLauncher.cmd"

[Setup]
AppId={{A2F77B5A-7D0E-4B15-9B8A-0A9B6E6A5C11}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\OmniKes
DefaultGroupName=OmniKès
OutputDir=..\dist\installer
OutputBaseFilename=OmniKes-Setup-{#MyAppVersion}-x64
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern dynamic
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UseSetupLdr=x64
UninstallDisplayIcon={app}\omnikes.ico
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no

[Files]
Source: "..\dist\windows\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\dist\windows\node\*"; DestDir: "{app}\runtime\node"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\dist\windows\postgresql\*"; DestDir: "{app}\runtime\postgresql"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\dist\windows\installer\*"; DestDir: "{app}\installer"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\public\*"; DestDir: "{app}\app\public"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\prisma\migrations\*"; DestDir: "{app}\app\prisma\migrations"; Flags: recursesubdirs createallsubdirs ignoreversion

[Dirs]
Name: "{commonappdata}\OmniKes"
Name: "{commonappdata}\OmniKes\postgresql-data"

[Icons]
Name: "{autoprograms}\OmniKès"; Filename: "{app}\OmniKesLauncher.cmd"; WorkingDir: "{app}"
Name: "{autodesktop}\OmniKès"; Filename: "{app}\OmniKesLauncher.cmd"; WorkingDir: "{app}"

[Run]
Filename: "{app}\installer\install-runtime.cmd"; Parameters: """{tmp}\omnikes-install.env"""; StatusMsg: "Configuration du runtime local OmniKès..."; Flags: waituntilterminated runhidden
Filename: "{app}\OmniKesLauncher.cmd"; WorkingDir: "{app}"; StatusMsg: "Démarrage d'OmniKès..."; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\installer\uninstall-runtime.cmd"; Flags: runhidden waituntilterminated

[Code]
var
  LocalSetupPage: TInputQueryWizardPage;

procedure InitializeWizard();
begin
  LocalSetupPage := CreateInputQueryPage(
    wpSelectDir,
    'Configuration initiale d''OmniKès',
    'Créez l''organisation et le compte administrateur',
    'Ces informations servent uniquement à initialiser la base locale. Le cloud et la boutique en ligne restent désactivés.'
  );
  LocalSetupPage.Add('Nom de l''organisation', False);
  LocalSetupPage.Add('Nom du magasin principal', False);
  LocalSetupPage.Add('Nom de l''administrateur', False);
  LocalSetupPage.Add('Courriel de l''administrateur', False);
  LocalSetupPage.Add('Mot de passe (12 caractères minimum)', True);
  LocalSetupPage.Add('Confirmer le mot de passe', True);
  LocalSetupPage.Values[1] := 'Magasin principal';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Email: String;
begin
  Result := True;
  if CurPageID <> LocalSetupPage.ID then
    Exit;

  Email := Trim(LocalSetupPage.Values[3]);
  if Trim(LocalSetupPage.Values[0]) = '' then begin
    MsgBox('Le nom de l''organisation est obligatoire.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  if Trim(LocalSetupPage.Values[2]) = '' then begin
    MsgBox('Le nom de l''administrateur est obligatoire.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  if (Pos('@', Email) < 2) or (Pos('.', Email) <= Pos('@', Email) + 1) then begin
    MsgBox('Saisissez une adresse courriel valide pour l''administrateur.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  if Length(LocalSetupPage.Values[4]) < 12 then begin
    MsgBox('Le mot de passe doit contenir au moins 12 caractères.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
  if LocalSetupPage.Values[4] <> LocalSetupPage.Values[5] then begin
    MsgBox('Les deux mots de passe ne correspondent pas.', mbError, MB_OK);
    Result := False;
    Exit;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigPath: String;
  Config: String;
begin
  if CurStep = ssInstall then begin
    ConfigPath := ExpandConstant('{tmp}\omnikes-install.env');
    Config :=
      'OMNIKES_INSTALL_ORGANIZATION_NAME=' + Trim(LocalSetupPage.Values[0]) + #13#10 +
      'OMNIKES_INSTALL_STORE_NAME=' + Trim(LocalSetupPage.Values[1]) + #13#10 +
      'OMNIKES_INSTALL_ADMIN_NAME=' + Trim(LocalSetupPage.Values[2]) + #13#10 +
      'OMNIKES_INSTALL_ADMIN_EMAIL=' + Trim(LocalSetupPage.Values[3]) + #13#10 +
      'OMNIKES_INSTALL_ADMIN_PASSWORD=' + LocalSetupPage.Values[4] + #13#10;
    if not SaveStringToFile(ConfigPath, Config, False) then
      RaiseException('Impossible de préparer la configuration initiale sécurisée.');
  end;
end;
