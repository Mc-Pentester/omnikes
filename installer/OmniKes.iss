#define MyAppName "OmniKès"
#define MyAppVersion "0.1.1"
#define MyAppPublisher "OmniKès"
#define MyAppExeName "omnikes.exe"

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
UsePreviousAppDir=yes
DisableDirPage=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UseSetupLdr=x64
UninstallDisplayIcon={app}\installer\omnikes.exe
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no

[Files]
Source: "..\dist\windows\app\*"; DestDir: "{app}\app"; Excludes: ".env, .env.*"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\dist\windows\node\*"; DestDir: "{app}\runtime\node"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\dist\windows\postgresql\*"; DestDir: "{app}\runtime\postgresql"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\dist\windows\installer\*"; DestDir: "{app}\installer"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\installer\uninstall-runtime.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\installer\prepare-upgrade.ps1"; DestDir: "{tmp}"; Flags: dontcopy

[Dirs]
Name: "{commonappdata}\OmniKes"
Name: "{commonappdata}\OmniKes\postgresql-data"

[Icons]
Name: "{autoprograms}\OmniKès"; Filename: "{app}\installer\omnikes.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\OmniKès"; Filename: "{app}\installer\omnikes.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\installer\omnikes.exe"; WorkingDir: "{app}"; StatusMsg: "Démarrage d'OmniKès..."; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  PowerShellExe: string;
  PrepareScript: string;
begin
  Result := '';
  PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  try
    ExtractTemporaryFile('prepare-upgrade.ps1');
  except
    Result := 'Impossible de préparer la mise à jour : le script de fermeture sécurisée est absent.';
    exit;
  end;
  PrepareScript := ExpandConstant('{tmp}\prepare-upgrade.ps1');
  if not Exec(PowerShellExe,
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + PrepareScript + '" -InstallRoot "' + ExpandConstant('{app}') + '"',
    ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := 'Impossible de lancer l’arrêt sécurisé des composants OmniKès. Aucun fichier ne sera remplacé.';
    exit;
  end;
  if ResultCode <> 0 then
    Result := 'Un composant OmniKès est encore actif. La mise à jour est annulée avant remplacement des fichiers. Consultez ProgramData\OmniKes\logs\prepare-upgrade.log.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  RuntimeNode: string;
  RuntimeInstaller: string;
  WebView2Installer: string;
begin
  if CurStep = ssPostInstall then
  begin
    RuntimeNode := ExpandConstant('{app}\runtime\node\node.exe');
    RuntimeInstaller := ExpandConstant('{app}\installer\install-runtime.cjs');
    if not Exec(RuntimeNode, '"' + RuntimeInstaller + '" --program-data-dir "' + ExpandConstant('{commonappdata}') + '"', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      RaiseException('Impossible de lancer la configuration du runtime PostgreSQL OmniKes.');
    if ResultCode <> 0 then
      RaiseException('La configuration du runtime PostgreSQL OmniKes a échoué (code ' + IntToStr(ResultCode) + '). Consultez le journal : ' + ExpandConstant('{commonappdata}\OmniKes\logs\runtime-install.log') + '.');
    if not FileExists(ExpandConstant('{commonappdata}\OmniKes\postgresql-port.txt')) then
      RaiseException('La configuration PostgreSQL est incomplète : le fichier postgresql-port.txt n’a pas été créé dans ProgramData.');
    if not FileExists(ExpandConstant('{commonappdata}\OmniKes\app-port.txt')) then
      RaiseException('La configuration OmniKès est incomplète : le fichier app-port.txt n’a pas été créé dans ProgramData.');
    WebView2Installer := ExpandConstant('{app}\installer\MicrosoftEdgeWebView2RuntimeInstallerX64.exe');
    if not FileExists(WebView2Installer) then
      RaiseException('Le runtime Microsoft WebView2 est absent du paquet OmniKès.');
    if not Exec(WebView2Installer, '/silent /install', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      RaiseException('Impossible de lancer l’installation du runtime Microsoft WebView2.');
    if (ResultCode <> 0) and (ResultCode <> 3010) then
      RaiseException('L’installation du runtime Microsoft WebView2 a échoué (code ' + IntToStr(ResultCode) + ').');
  end;
end;

function HasExplicitPurgeSwitch(): Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to ParamCount do
  begin
    if CompareText(ParamStr(I), '/PURGEDATA=yes') = 0 then
    begin
      Result := True;
      exit;
    end;
  end;
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
  PowerShellExe: string;
  CleanupScript: string;
  DeleteData: Boolean;
  CleanupArguments: string;
begin
  { Data deletion is opt-in only. In silent mode, require the exact switch.
    In interactive mode, retain the existing two-step confirmation. }
  DeleteData := HasExplicitPurgeSwitch();
  if (not DeleteData) and (not UninstallSilent()) then
  begin
    if MsgBox('Voulez-vous également supprimer toutes les données OmniKès (comptes, magasins, ventes, inventaire, paramètres, sauvegardes et journaux) ?' + #13#10 + #13#10 + 'Choisissez Non pour conserver vos données et pouvoir les retrouver lors d’une réinstallation.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      if MsgBox('CONFIRMATION DÉFINITIVE' + #13#10 + #13#10 + 'Toutes les données locales OmniKès dans ProgramData seront supprimées. Cette opération est irréversible. Continuer ?', mbCriticalError, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DeleteData := True;
    end;
  end;
  PowerShellExe := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
  CleanupScript := ExpandConstant('{app}\installer\uninstall-runtime.ps1');
  CleanupArguments := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + CleanupScript + '" -InstallRoot "' + ExpandConstant('{app}') + '"';
  if DeleteData then
    CleanupArguments := CleanupArguments + ' -DeleteData';
  if not Exec(PowerShellExe, CleanupArguments, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox('Impossible de préparer la désinstallation : les composants OmniKès n’ont pas pu être arrêtés. Aucun fichier ne sera supprimé.', mbError, MB_OK);
    Result := False;
    exit;
  end;
  if ResultCode <> 0 then
  begin
    MsgBox('Un service ou processus OmniKès est encore actif, ou les données n’ont pas pu être supprimées. La désinstallation est annulée. Consultez ProgramData\\OmniKes\\logs\\uninstall-runtime.log.', mbError, MB_OK);
    Result := False;
    exit;
  end;
  Result := True;
end;

[UninstallDelete]
; Remove residual program files, including the preserved app/.env configuration.
; ProgramData is preserved by default and deleted only after the user's explicit double confirmation.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\installer"
