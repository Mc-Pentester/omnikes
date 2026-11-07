using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class OmniKesLauncher
{
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

    [STAThread]
    private static void Main()
    {
        string launcherDirectory = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
        string installRoot = Path.GetFullPath(Path.Combine(launcherDirectory, ".."));
        string script = Path.GetFullPath(Path.Combine(launcherDirectory, "OmniKesLauncher.cmd"));
        string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string log = Path.Combine(localData, "OmniKes", "logs",
            "launcher-" + DateTime.Now.ToString("yyyyMMdd") + ".log");

        try
        {
            if (!File.Exists(script))
                throw new FileNotFoundException("Le lanceur interne OmniKes est introuvable. Réinstallez l'application.", script);

            Directory.CreateDirectory(Path.GetDirectoryName(log));
            string appUrl = ReadApplicationUrl();
            string healthUrl = new Uri(new Uri(appUrl), "api/health").ToString();
            StartServerHelper(script, installRoot, log);

            if (!WaitForServer(healthUrl, log, 90))
                throw new InvalidOperationException("OmniKes n'a pas répondu après 90 secondes. Consultez le journal : " + log);

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new OmniKesWindow(Path.Combine(localData, "OmniKes", "WebView2"), appUrl, log));
        }
        catch (Exception ex)
        {
            try { File.AppendAllText(log, DateTime.Now.ToString("s") + " ERROR " + ex + Environment.NewLine); } catch { }
            MessageBox.Show(
                "Impossible de démarrer OmniKès :" + Environment.NewLine + ex.Message +
                Environment.NewLine + Environment.NewLine + "Journal : " + log,
                "Démarrage d'OmniKès", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void StartServerHelper(string script, string installRoot, string log)
    {
        ProcessStartInfo start = new ProcessStartInfo();
        start.FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
        string quote = ((char)34).ToString();
        start.Arguments = "/d /s /c " + quote + quote + script + quote + quote;
        start.WorkingDirectory = installRoot;
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.WindowStyle = ProcessWindowStyle.Hidden;
        Process process = Process.Start(start);
        if (process == null)
            throw new InvalidOperationException("Impossible de démarrer le serveur local OmniKès.");
        process.WaitForExit(15000);
        if (process.HasExited && process.ExitCode != 0)
            throw new InvalidOperationException("Le lanceur interne a échoué (code " + process.ExitCode + "). Consultez : " + log);
    }

    private static bool WaitForServer(string healthUrl, string log, int seconds)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(healthUrl);
                request.Timeout = 1500;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                    {
                        string body = reader.ReadToEnd();
                        if ((int)response.StatusCode == 200 && body.IndexOf("\"application\":\"OmniKes\"", StringComparison.OrdinalIgnoreCase) >= 0)
                            return true;
                    }
                }
            }
            catch { }
            Thread.Sleep(1000);
        }
        return false;
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
        Width = 1440;
        Height = 920;
        MinimumSize = new System.Drawing.Size(900, 650);
        StartPosition = FormStartPosition.CenterScreen;

        browser = new WebView2();
        browser.Dock = DockStyle.Fill;
        Controls.Add(browser);
        Shown += InitializeBrowser;
    }

    private async void InitializeBrowser(object sender, EventArgs e)
    {
        try
        {
            Directory.CreateDirectory(userDataFolder);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await browser.EnsureCoreWebView2Async(environment);

            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.NavigationStarting += HandleNavigation;
            browser.CoreWebView2.NewWindowRequested += HandleNewWindow;
            browser.CoreWebView2.Navigate(appUrl);
        }
        catch (Exception ex)
        {
            try { File.AppendAllText(log, DateTime.Now.ToString("s") + " WEBVIEW2 ERROR " + ex + Environment.NewLine); } catch { }
            MessageBox.Show(
                "La fenêtre OmniKès n'a pas pu être initialisée. Vérifiez que le runtime Microsoft Edge WebView2 est installé." +
                Environment.NewLine + ex.Message + Environment.NewLine + Environment.NewLine + "Journal : " + log,
                "OmniKès", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
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

    private void HandleNewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        Uri target;
        if (Uri.TryCreate(e.Uri, UriKind.Absolute, out target)) OpenExternal(target);
    }

    private static void OpenExternal(Uri target)
    {
        if (target.Scheme != Uri.UriSchemeHttp && target.Scheme != Uri.UriSchemeHttps) return;
        try { Process.Start(new ProcessStartInfo(target.ToString()) { UseShellExecute = true }); } catch { }
    }
}
