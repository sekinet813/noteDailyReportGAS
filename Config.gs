var Config = (function () {
  var instance;
  function Config() {
    var props = PropertiesService.getScriptProperties();
    this.openaiKey = props.getProperty("OPENAI_API_KEY");
    this.cookie = props.getProperty("NOTE_COOKIE");
    this.folderId = props.getProperty("NOTE_SPREADSHEET_FOLDER_ID");
    this.recipient = props.getProperty("RECIPIENT");
    this.timezone = 'Asia/Tokyo';
  }
  Config.getInstance = function () {
    if (!instance) instance = new Config();
    return instance;
  };
  return Config;
})();
