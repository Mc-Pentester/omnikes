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
Filename: "{app}\installer\install-runtime.cmd"; Parameters: ""; StatusMsg: "Configuration du runtime local OmniKès..."; Flags: waituntilterminated runhidden
Filename: "{app}\OmniKesLauncher.cmd"; WorkingDir: "{app}"; StatusMsg: "Démarrage d'OmniKès..."; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop OmniKesPostgreSQL"; Flags: runhidden
Filename: "{sys}\sc.exe"; Parameters: "delete OmniKesPostgreSQL"; Flags: runhidden
