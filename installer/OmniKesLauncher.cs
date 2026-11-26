using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class OmniKesLauncher
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new OmniKesApplicationContext());
    }
}

internal sealed class OmniKesApplicationContext : ApplicationContext
{
    private readonly OmniKesSplash splash;
    private string launcherDirectory;
    private string installRoot;
    private string script;
    private string log;
    private string appUrl;

    public OmniKesApplicationContext()
    {
        launcherDirectory = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
        installRoot = Path.GetFullPath(Path.Combine(launcherDirectory, ".."));
        script = Path.GetFullPath(Path.Combine(launcherDirectory, "OmniKesLauncher.cmd"));
        string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        log = Path.Combine(localData, "OmniKes", "logs", "launcher-" + DateTime.Now.ToString("yyyyMMdd") + ".log");

        splash = new OmniKesSplash();
        splash.Shown += BeginStartup;
        splash.Show();
    }

    private async void BeginStartup(object sender, EventArgs e)
    {
        try
        {
            await Task.Run(delegate
            {
                splash.SetStatus("Préparation du démarrage d’OmniKès...", 12);
                if (!File.Exists(script))
                    throw new FileNotFoundException("Le lanceur interne OmniKes est introuvable. Réinstallez l'application.", script);

                Directory.CreateDirectory(Path.GetDirectoryName(log));
                appUrl = ReadApplicationUrl();
                string healthUrl = new Uri(new Uri(appUrl), "api/health").ToString();

                splash.SetStatus("Démarrage des services locaux...", 28);
                StartServerHelper(script, installRoot, log);

                splash.SetStatus("Connexion à la base de données PostgreSQL...", 58);
                if (!WaitForServer(healthUrl, log, 90, delegate(int percent)
                {
                    splash.SetStatus("Initialisation de l’application et vérification des services...", percent);
                }))
                    throw new InvalidOperationException("OmniKes n'a pas répondu après 90 secondes. Consultez le journal : " + log);

                splash.SetStatus("Ouverture de l’interface OmniKès...", 96);
            });

            string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            splash.SetStatus("Chargement du moteur d’affichage...", 96);
            OmniKesWindow window = new OmniKesWindow(Path.Combine(localData, "OmniKes", "WebView2"), appUrl, log);
            window.FormClosed += delegate { ExitThread(); };
            MainForm = window;
            window.Opacity = 0;
            window.ShowInTaskbar = false;
            window.Show();
            await window.PrepareAsync();
            splash.SetStatus("OmniKès est prêt.", 100);
            window.ShowInTaskbar = true;
            window.Opacity = 1;
            splash.Close();
            window.Activate();
        }
        catch (Exception ex)
        {
            try { Directory.CreateDirectory(Path.GetDirectoryName(log)); File.AppendAllText(log, DateTime.Now.ToString("s") + " ERROR " + ex + Environment.NewLine); } catch { }
            splash.Close();
            MessageBox.Show(
                "Impossible de démarrer OmniKès :" + Environment.NewLine + ex.Message +
                Environment.NewLine + Environment.NewLine + "Journal : " + log,
                "Démarrage d'OmniKès", MessageBoxButtons.OK, MessageBoxIcon.Error);
            ExitThread();
        }
    }

    private static string ReadApplicationUrl()
    {
        string programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        string portFile = Path.Combine(programData, "OmniKes", "app-port.txt");
        if (!File.Exists(portFile))
            throw new FileNotFoundException("La configuration du port OmniKès est introuvable.", portFile);

        int port;
        if (!Int32.TryParse(File.ReadAllText(portFile).Trim(), out port) || port < 3001 || port > 3099)
            throw new InvalidOperationException("Le port configuré pour OmniKès est invalide.");

        return "http://127.0.0.1:" + port + "/";
    }

    private static void StartServerHelper(string script, string installRoot, string log)
    {
        ProcessStartInfo start = new ProcessStartInfo();
        string systemRoot = Environment.GetEnvironmentVariable("SystemRoot");
        if (String.IsNullOrWhiteSpace(systemRoot))
            throw new InvalidOperationException("La variable système SystemRoot est absente.");
        string system32 = Path.Combine(systemRoot, "System32");
        start.FileName = Path.Combine(system32, "cmd.exe");
        string quote = ((char)34).ToString();
        start.Arguments = "/d /s /c " + quote + quote + script + quote + quote;
        start.WorkingDirectory = installRoot;
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.WindowStyle = ProcessWindowStyle.Hidden;
        start.EnvironmentVariables["ComSpec"] = Path.Combine(system32, "cmd.exe");
        start.EnvironmentVariables["PATH"] = system32 + Path.PathSeparator +
            Path.Combine(installRoot, "runtime", "node");
        start.EnvironmentVariables["OMNIKES_HOME"] = installRoot;
        start.EnvironmentVariables["OMNIKES_LOG_DIR"] = Path.GetDirectoryName(log);
        start.EnvironmentVariables["NODE_OPTIONS"] = String.Empty;
        start.EnvironmentVariables["DATABASE_URL"] = String.Empty;
        start.EnvironmentVariables["PORT"] = String.Empty;
        start.EnvironmentVariables["HOSTNAME"] = String.Empty;
        Process process = Process.Start(start);
        if (process == null)
            throw new InvalidOperationException("Impossible de démarrer le serveur local OmniKès.");
        process.WaitForExit(15000);
        if (process.HasExited && process.ExitCode != 0)
            throw new InvalidOperationException("Le lanceur interne a échoué (code " + process.ExitCode + "). Consultez : " + log);
    }

    private static bool WaitForServer(string healthUrl, string log, int seconds, Action<int> progress)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(seconds);
        int percent = 62;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(healthUrl);
                request.Timeout = 1500;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string body = reader.ReadToEnd();
                    if ((int)response.StatusCode == 200 &&
                        body.IndexOf("\"application\":\"OmniKes\"", StringComparison.OrdinalIgnoreCase) >= 0)
                        return true;
                }
            }
            catch { }
            if (progress != null)
            {
                percent = Math.Min(92, percent + 1);
                progress(percent);
            }
            Thread.Sleep(1000);
        }
        return false;
    }
}

internal sealed class OmniKesSplash : Form
{
    private readonly Label status;
    private readonly Label percentLabel;
    private readonly ProgressBar progress;
    private readonly System.Windows.Forms.Timer animationTimer;
    private readonly Label spinner;
    private int pulse;

    public OmniKesSplash()
    {
        Text = "OmniKès";
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        ShowInTaskbar = true;
        ClientSize = new Size(760, 430);
        BackColor = Color.White;
        Font = new Font("Segoe UI", 10F, FontStyle.Regular);

        Panel top = new Panel();
        top.Dock = DockStyle.Top;
        top.Height = 8;
        top.BackColor = Color.FromArgb(0, 91, 205);
        Controls.Add(top);

        PictureBox mark = new PictureBox();
        mark.Location = new Point(54, 62);
        mark.Size = new Size(126, 126);
        mark.SizeMode = PictureBoxSizeMode.Zoom;
        try { mark.Image = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath).ToBitmap(); } catch { }
        Controls.Add(mark);

        Label brand = new Label();
        brand.Text = "OmniKès";
        brand.Font = new Font("Segoe UI", 42F, FontStyle.Bold);
        brand.ForeColor = Color.FromArgb(8, 36, 91);
        brand.Location = new Point(205, 76);
        brand.Size = new Size(490, 64);
        Controls.Add(brand);

        Label subtitle = new Label();
        subtitle.Text = "L O G I C I E L   P O S";
        subtitle.Font = new Font("Segoe UI", 15F, FontStyle.Regular);
        subtitle.ForeColor = Color.FromArgb(0, 105, 220);
        subtitle.Location = new Point(211, 143);
        subtitle.Size = new Size(440, 32);
        Controls.Add(subtitle);

        Panel separator = new Panel();
        separator.BackColor = Color.FromArgb(0, 115, 220);
        separator.Location = new Point(205, 184);
        separator.Size = new Size(430, 2);
        Controls.Add(separator);

        Label wait = new Label();
        spinner = new Label();
        spinner.Text = "◴";
        spinner.Font = new Font("Segoe UI Symbol", 24F, FontStyle.Regular);
        spinner.ForeColor = Color.FromArgb(0, 105, 220);
        spinner.TextAlign = ContentAlignment.MiddleCenter;
        spinner.Location = new Point(355, 181);
        spinner.Size = new Size(50, 40);
        Controls.Add(spinner);

        wait.Text = "Veuillez patienter...";
        wait.Font = new Font("Segoe UI", 21F, FontStyle.Bold);
        wait.ForeColor = Color.FromArgb(8, 36, 91);
        wait.TextAlign = ContentAlignment.MiddleCenter;
        wait.Location = new Point(105, 220);
        wait.Size = new Size(550, 42);
        Controls.Add(wait);

        status = new Label();
        status.Text = "Préparation du démarrage d’OmniKès...";
        status.Font = new Font("Segoe UI", 11F, FontStyle.Regular);
        status.ForeColor = Color.FromArgb(55, 75, 110);
        status.TextAlign = ContentAlignment.MiddleCenter;
        status.Location = new Point(70, 269);
        status.Size = new Size(620, 30);
        Controls.Add(status);

        progress = new ProgressBar();
        progress.Location = new Point(72, 318);
        progress.Size = new Size(616, 16);
        progress.Minimum = 0;
        progress.Maximum = 100;
        progress.Style = ProgressBarStyle.Continuous;
        progress.ForeColor = Color.FromArgb(0, 105, 220);
        Controls.Add(progress);

        percentLabel = new Label();
        percentLabel.Text = "0 %";
        percentLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        percentLabel.ForeColor = Color.FromArgb(8, 36, 91);
        percentLabel.TextAlign = ContentAlignment.MiddleRight;
        percentLabel.Location = new Point(620, 340);
        percentLabel.Size = new Size(68, 22);
        Controls.Add(percentLabel);

        Label tagline = new Label();
        tagline.Text = "Vendez.  Gérez.  Développez.";
        tagline.Font = new Font("Segoe UI", 12F, FontStyle.Regular);
        tagline.ForeColor = Color.FromArgb(8, 36, 91);
        tagline.TextAlign = ContentAlignment.MiddleCenter;
        tagline.Location = new Point(100, 377);
        tagline.Size = new Size(560, 28);
        Controls.Add(tagline);

        Panel bottom = new Panel();
        bottom.Dock = DockStyle.Bottom;
        bottom.Height = 5;
        bottom.BackColor = Color.FromArgb(242, 157, 25);
        Controls.Add(bottom);

        animationTimer = new System.Windows.Forms.Timer();
        animationTimer.Interval = 450;
        animationTimer.Tick += delegate
        {
            pulse = (pulse + 1) % 4;
            string[] frames = new string[] { "◴", "◷", "◶", "◵" };
            spinner.Text = frames[pulse];
        };
        animationTimer.Start();
        FormClosed += delegate { animationTimer.Stop(); };
    }

    public void SetStatus(string message, int value)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            try { BeginInvoke(new Action<string, int>(SetStatus), message, value); } catch { }
            return;
        }
        status.Text = message;
        progress.Value = Math.Max(progress.Minimum, Math.Min(progress.Maximum, value));
        percentLabel.Text = value.ToString() + " %";
    }
}

internal sealed class OmniKesWindow : Form
{
    private readonly WebView2 browser;
    private readonly string userDataFolder;
    private readonly string appUrl;
    private readonly string log;

    public OmniKesWindow(string profilePath, string applicationUrl, string logPath)
    {
        userDataFolder = profilePath;
        appUrl = applicationUrl;
        log = logPath;
        Text = "OmniKès";
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Width = 1440;
        Height = 920;
        MinimumSize = new System.Drawing.Size(900, 650);
        StartPosition = FormStartPosition.CenterScreen;

        browser = new WebView2();
        browser.Dock = DockStyle.Fill;
        Controls.Add(browser);

    }

    public async Task PrepareAsync()
    {
        Directory.CreateDirectory(userDataFolder);
        CreateControl();
        browser.CreateControl();
        CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await browser.EnsureCoreWebView2Async(environment);

        browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
        browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
        browser.CoreWebView2.NavigationStarting += HandleNavigation;
        browser.CoreWebView2.NewWindowRequested += HandleNewWindow;

        TaskCompletionSource<bool> navigation = new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2NavigationCompletedEventArgs> completed = null;
        completed = delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            browser.CoreWebView2.NavigationCompleted -= completed;
            navigation.TrySetResult(args.IsSuccess);
        };
        browser.CoreWebView2.NavigationCompleted += completed;
        browser.CoreWebView2.Navigate(appUrl);

        Task finished = await Task.WhenAny(navigation.Task, Task.Delay(30000));
        if (finished != navigation.Task)
            throw new TimeoutException("Le chargement de l’interface OmniKès a dépassé 30 secondes.");
        if (!navigation.Task.Result)
            throw new InvalidOperationException("Le navigateur intégré n’a pas pu charger l’interface OmniKès.");
    }

    private void HandleNavigation(object sender, CoreWebView2NavigationStartingEventArgs e)
    {
        Uri target;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out target) &&
            (target.Scheme != Uri.UriSchemeHttp || target.Host != "127.0.0.1" || target.Port != new Uri(appUrl).Port))
        {
            e.Cancel = true;
            OpenExternal(target);
        }
    }

    private async void HandleNewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        Uri target;
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out target))
        {
            e.Handled = true;
            return;
        }

        Uri origin = new Uri(appUrl);
        bool blankPopup = target.Scheme == "about" && target.AbsoluteUri == "about:blank";
        bool localPage = target.Scheme == Uri.UriSchemeHttp && target.Host == origin.Host && target.Port == origin.Port;
        if (!blankPopup && !localPage)
        {
            e.Handled = true;
            OpenExternal(target);
            return;
        }

        // BrowserPrinterAdapter intentionally opens about:blank synchronously
        // from the POS click, then navigates that same window to the print URL.
        // Assign NewWindow so the JavaScript WindowProxy remains valid.
        e.Handled = true;
        CoreWebView2Deferral deferral = e.GetDeferral();
        OmniKesPopupWindow popup = new OmniKesPopupWindow(browser.CoreWebView2.Environment, origin);
        try
        {
            await popup.PrepareAsync();
            e.NewWindow = popup.CoreWebView2;
            popup.Show(this);
        }
        catch (Exception ex)
        {
            try { File.AppendAllText(log, DateTime.Now.ToString("s") + " PRINT_WINDOW_ERROR " + ex + Environment.NewLine); } catch { }
            popup.Close();
            MessageBox.Show(this, "Impossible d’ouvrir la fenêtre d’impression : " + ex.Message,
                "OmniKès", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally { deferral.Complete(); }
    }

    private static void OpenExternal(Uri target)
    {
        if (target.Scheme != Uri.UriSchemeHttp && target.Scheme != Uri.UriSchemeHttps) return;
        try { Process.Start(new ProcessStartInfo(target.ToString()) { UseShellExecute = true }); } catch { }
    }
}

internal sealed class OmniKesPopupWindow : Form
{
    private readonly CoreWebView2Environment environment;
    private readonly Uri applicationOrigin;
    private readonly WebView2 browser;

    public CoreWebView2 CoreWebView2 { get { return browser.CoreWebView2; } }

    public OmniKesPopupWindow(CoreWebView2Environment webViewEnvironment, Uri origin)
    {
        environment = webViewEnvironment;
        applicationOrigin = origin;
        Text = "OmniKès — Impression";
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Width = 1000;
        Height = 800;
        MinimumSize = new System.Drawing.Size(640, 480);
        StartPosition = FormStartPosition.CenterParent;
        browser = new WebView2();
        browser.Dock = DockStyle.Fill;
        Controls.Add(browser);
    }

    public async Task PrepareAsync()
    {
        CreateControl();
        browser.CreateControl();
        await browser.EnsureCoreWebView2Async(environment);
        browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
        browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
        browser.CoreWebView2.WindowCloseRequested += delegate { Close(); };
        browser.CoreWebView2.NavigationStarting += HandleNavigation;
        browser.CoreWebView2.NewWindowRequested += HandleNestedWindow;
    }

    private void HandleNavigation(object sender, CoreWebView2NavigationStartingEventArgs e)
    {
        Uri navigation;
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out navigation)) { e.Cancel = true; return; }
        bool local = navigation.Scheme == Uri.UriSchemeHttp &&
            navigation.Host == applicationOrigin.Host && navigation.Port == applicationOrigin.Port;
        if (!local && navigation.Scheme != "about")
        {
            e.Cancel = true;
            OpenExternal(navigation);
        }
    }

    private void HandleNestedWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        Uri nested;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out nested) &&
            nested.Scheme == Uri.UriSchemeHttp && nested.Host == applicationOrigin.Host && nested.Port == applicationOrigin.Port)
            browser.CoreWebView2.Navigate(nested.ToString());
        else if (Uri.TryCreate(e.Uri, UriKind.Absolute, out nested))
            OpenExternal(nested);
    }

    private static void OpenExternal(Uri target)
    {
        if (target.Scheme != Uri.UriSchemeHttp && target.Scheme != Uri.UriSchemeHttps) return;
        try { Process.Start(new ProcessStartInfo(target.ToString()) { UseShellExecute = true }); } catch { }
    }
}
