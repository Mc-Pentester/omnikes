#define MyAppName "OmniKès"
#define MyAppVersion "0.1.0"
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

[Dirs]
Name: "{commonappdata}\OmniKes"
Name: "{commonappdata}\OmniKes\postgresql-data"

[Icons]
Name: "{autoprograms}\OmniKès"; Filename: "{app}\installer\omnikes.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\OmniKès"; Filename: "{app}\installer\omnikes.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\installer\omnikes.exe"; WorkingDir: "{app}"; StatusMsg: "Démarrage d'OmniKès..."; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  RuntimeNode: string;
  RuntimeInstaller: string;
begin
  if CurStep = ssPostInstall then
  begin
    RuntimeNode := ExpandConstant('{app}\runtime\node\node.exe');
    RuntimeInstaller := ExpandConstant('{app}\installer\install-runtime.cjs');
    if not Exec(RuntimeNode, '"' + RuntimeInstaller + '" --program-data-dir "' + ExpandConstant('{commonappdata}') + '"', ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      RaiseException('Impossible de lancer la configuration du runtime PostgreSQL OmniKes.');
    if ResultCode <> 0 then
      RaiseException('La configuration du runtime PostgreSQL OmniKes a échoué (code ' + IntToStr(ResultCode) + '). L’installation est interrompue.');
    if not FileExists(ExpandConstant('{commonappdata}\\OmniKes\\postgresql-port.txt')) then
      RaiseException('La configuration PostgreSQL est incomplète : le fichier postgresql-port.txt n’a pas été créé dans ProgramData.');
  end;
end;

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop OmniKesPostgreSQL"; Flags: runhidden
Filename: "{sys}\sc.exe"; Parameters: "delete OmniKesPostgreSQL"; Flags: runhidden
