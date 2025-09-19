const fs = require('fs')
const path = require('path');

/**
 * update property file with the given key and action
 * @param {*} filePath 
 * the file path for the property file
 * @param {*} key 
 * the key to be updated
 * @param {*} action 
 * the action to be performed, "+" for add, "-" for remove
 * @param {*} changes 
 * the file changes object containing the added and removed key-value pairs
 * @returns 
 */
function updatePropFileWithOneAction(filePath, key, action, changes) {

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    //if file does not exist, create an empty file, 
    //this is to ensure that the file exists before we try to read it
    //create the directory if it does not exist
    //Ensure the directory exists
    const dir = path.dirname(absolutePath);
    fs.mkdirSync(dir, { recursive: true });
    // Write the empty file
    fs.writeFileSync(absolutePath, '', 'utf-8');
  }

  //the previous key in the order of changes, this is used for + action
  //the added key value pair will be added after this previous key
  let preKey = ""
  if (action == "+" && changes.keysOrderInDiff.indexOf(key) !== 0) {
    preKey = changes.keysOrderInDiff[changes.keysOrderInDiff.indexOf(key) - 1];
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf-8');
  if (action === '+' && fileContent.trim() === '') {
    //add the first key-value pair to the empty file
    fs.writeFileSync(absolutePath, `${key}=${changes.addedKeyValueMap.get(key)}`, 'utf-8');
    return;
  }

  const lines = fileContent.split('\n');
  let updatedLines = [];
  let added = false;
  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('!')) {
      //add comments or empty lines, do not change them
      updatedLines.push(line);
      return;
    }

    const [currentKey, ...currentValueParts] = trimmedLine.split('=');
    if (action == "+" && currentKey.trim() === preKey) {
      //insert the new line after the preKey
      if(!added){
        //add the previous key line
        updatedLines.push(line);
        //add the new key-value pair
        updatedLines.push(`${key}=${changes.addedKeyValueMap.get(key)}`);
        added = true;
        // return true;// break forEach
      }
    } else if (action == "-" && currentKey.trim() === key) {
      //do nothing to remove this line from file
    } else {
      //do not change this line
      updatedLines.push(line);
    }
  });

  //if the previous key is not found in the file, add it at the end
  if(action === "+" && !added) {
    updatedLines.unshift(`${key}=${changes.addedKeyValueMap.get(key)}`);
  }
  fs.writeFileSync(absolutePath, updatedLines.join('\n'), 'utf-8');
}

/**
 * 
 * @param {*} filePath 
 * @param {*} changes 
 */
function updatePropFileWithChanges(filePath, changes) {

  changes.actionsOrder.forEach(action => {
    updatePropFileWithOneAction(filePath, action.key, action.action, changes);
  });

}

/**
 * 
 * @param {*} diffOutput 
 * the output of 'git diff' command
 * @param {*} enUS
 * true if process i18n_en_US.properties file
 */
async function handleGitDiff(diffOutput, enUS) {

  console.log(">>>>>>diffOutput");
  console.log(diffOutput);
  console.log("<<<<<<");
  console.log(">>>>>>enUS");
  console.log(enUS);
  console.log("<<<<<<");

  const files = [];
  const fileDiffs = diffOutput.split(/diff --git a\//).slice(1);

  for (const fileDiff of fileDiffs) {
    const [filePathLine, ...diffLines] = fileDiff.split('\n');
    const filePath = filePathLine.split(' b/')[1].trim();

    const changes = {
      // This will hold the added key-value pairs
      addedKeyValueMap: new Map(),
      // This will hold the removed key-value pairs
      removedKeyValueMap: new Map(),
      // This will hold the key orders in 'git diff'
      keysOrderInDiff: [],
      // +, - action orders
      actionsOrder: []
    };
    for (const line of diffLines) {
      //skip the comments
      if (line.trim().startsWith("#") || line.trim().startsWith("!")) {
        continue;
      }
      
      if (line.trim().startsWith("@@")) {
        // Handle the line, eg, @@ -170,6 +192,7 @@ BTN_EDIT=Edit
        // Extract the string after the second @@
        const match = line.match(/@@.*?@@\s*(.*)/);
        if (match[1]) {
          const [key, value] = match[1].split('=').map(part => part.trim());
          if (key && value) {
            changes.keysOrderInDiff.push(key);
          }
        }
        continue;
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        //add lines
        const addedLine = line.slice(1).trim();
        if (addedLine.includes('=') && addedLine.split('=').length === 2) {
          const [key, value] = addedLine.split('=').map(part => part.trim());
          if (key && value) {
            changes.addedKeyValueMap.set(key, value);
            changes.keysOrderInDiff.push(key);
            changes.actionsOrder.push({ key: key, action: "+" });
          }
        }
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        //remove lines
        const removedLine = line.slice(1).trim();
        if (removedLine.includes('=') && removedLine.split('=').length === 2) {
          const [key, value] = removedLine.split('=').map(part => part.trim());
          if (key && value) {
            changes.removedKeyValueMap.set(key, value);
            changes.actionsOrder.push({ key: key, action: "-" });
          }
        }
      } else {
        if (line.trim().includes('=') && line.trim().split('=').length === 2) {
          const [key, value] = line.trim().split('=').map(part => part.trim());
          changes.keysOrderInDiff.push(key);
        }
      }
    }
    files.push({ filePath, changes });
  }

  let mapToObject = function (map) {
    const obj = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    return obj;
  };

  console.log(
    'Beautified Output:',
    JSON.stringify(
      files.map(file => ({
        ...file,
        changes: {
          ...file.changes,
          addedKeyValueMap: mapToObject(file.changes.addedKeyValueMap),
          removedKeyValueMap: mapToObject(file.changes.removedKeyValueMap),
        },
      })),
      null,
      2
    )
  );

  files.forEach(file => {
    updatePropFileWithChanges(String(file.filePath).replace("i18n.properties", "i18n_en.properties"), file.changes);
    if(enUS === "true") {
      updatePropFileWithChanges(String(file.filePath).replace("i18n.properties", "i18n_en_US.properties"), file.changes);
    }
  });

}


(async function () {
  const fileContent = process.env.DIFF;
  const enUS = process.env.ENUS;
  await handleGitDiff(fileContent,enUS);
})()