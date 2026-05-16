<?php
/**
 * Lampa Plugin Auto-Loader
 * Сканує папку plugins/ і повертає JSON зі списком файлів
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, must-revalidate');

$plugins_dir = __DIR__;
$plugins     = [];

// Скануємо всі .js файли в папці plugins/
$files = glob($plugins_dir . '/*.js');

if ($files) {
    // Сортуємо: спочатку файли з меншим номером/назвою
    usort($files, function($a, $b) {
        // Файли з префіксом числа йдуть першими (01_plugin.js, 02_plugin.js...)
        $na = basename($a);
        $nb = basename($b);
        return strnatcasecmp($na, $nb);
    });

    foreach ($files as $file) {
        $filename = basename($file);

        // Пропускаємо службові файли
        if (in_array($filename, ['loader.php'])) continue;

        // Читаємо метадані з заголовка файлу (перші 30 рядків)
        $meta   = readMeta($file);
        $name   = $meta['name']   ?? pathinfo($filename, PATHINFO_FILENAME);
        $ver    = $meta['version'] ?? '';
        $author = $meta['author'] ?? '';
        $desc   = $meta['description'] ?? '';

        $plugins[] = [
            'file'        => 'plugins/' . $filename,
            'name'        => $name,
            'version'     => $ver,
            'author'      => $author,
            'description' => $desc,
            'size'        => filesize($file),
            'mtime'       => date('Y-m-d H:i:s', filemtime($file)),
        ];
    }
}

echo json_encode([
    'status'  => 'ok',
    'count'   => count($plugins),
    'plugins' => $plugins,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

/**
 * Читає @name, @version, @author, @description з заголовка JS-файлу
 * Підтримує формат:
 *   // @name     Мій плагін
 *   // @version  1.0.0
 *   // @author   Іван
 *   // @description Опис плагіну
 */
function readMeta(string $path): array {
    $meta  = [];
    $lines = 0;

    if (!($fh = @fopen($path, 'r'))) return $meta;

    while (!feof($fh) && $lines < 30) {
        $line = fgets($fh);
        $lines++;

        if (preg_match('/\/\/\s*@(name|version|author|description)\s+(.+)/i', $line, $m)) {
            $meta[strtolower($m[1])] = trim($m[2]);
        }
    }

    fclose($fh);
    return $meta;
}
