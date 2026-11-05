using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class OmniKesLauncher
{
    [STAThread]
    private static void Main()
    {
        // The executable and command script are both installed in {app}\\installer.
        string launcherDirectory = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
        string installRoot = Path.GetFullPath(Path.Combine(launcherDirectory, ".."));
        string script = Path.GetFullPath(Path.Combine(launcherDirectory, "OmniKesLauncher.cmd"));
        string log = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OmniKes", "logs",
            "launcher-" + DateTime.Now.ToString("yyyyMMdd") + ".log");

        try
        {
            if (!File.Exists(script))
                throw new FileNotFoundException(
                    "Le lanceur interne OmniKes est introuvable. Réinstallez l'application.",
                    script);

            Directory.CreateDirectory(Path.GetDirectoryName(log));

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            // Use cmd.exe's required doubled quotes; this also supports installation paths with spaces.
            string quote = ((char)34).ToString();
            start.Arguments = "/d /s /c " + quote + quote + script + quote + quote;
            start.WorkingDirectory = installRoot;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WindowStyle = ProcessWindowStyle.Hidden;

            Process process = Process.Start(start);
            if (process == null)
                throw new InvalidOperationException("Impossible de démarrer le lanceur interne OmniKes.");

            DateTime deadline = DateTime.UtcNow.AddSeconds(75);
            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3000/api/health");
                    request.Timeout = 1500;
                    request.Proxy = null;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if ((int)response.StatusCode == 200) return;
                    }
                }
                catch { }
                Thread.Sleep(1000);
            }

            MessageBox.Show(
                "OmniKes n'a pas pu démarrer. Vérifiez le service PostgreSQL Windows et consultez le journal :" + Environment.NewLine + log,
                "Démarrage d'OmniKes", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Impossible de lancer OmniKes :" + Environment.NewLine + ex.Message + Environment.NewLine + Environment.NewLine + "Journal : " + log,
                "Démarrage d'OmniKes", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
