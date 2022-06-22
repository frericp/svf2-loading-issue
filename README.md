# SVF2 Loading Issue

## Background

This repo was created to reproduce an issue with not receiving all svf2 data within the Forge Viewer when loading multiple models. For our purposes, we need to have both the geometry data as well as the object tree before we do some additional work to the models (not included in this repo).

In order to know when this data has been received, we are listening to the `GEOMETRY_LOADED_EVENT` and `OBJECT_TREE_CREATED_EVENT` events for each model. We are keeping track of which ones have been received for each model using a Map with the modelId as the key. Once both events have been received for a given modelId, it is removed from the Map.

After starting the load for all models, we are then looking in the Map for any remaining models and checking to see if we've gotten the data we need (`model.isLoadDone()` for geometry and `model.getData().instanceTree` for the object tree) even if the events weren't received. The majority of the time, we do have all of the data when this check is done, but if not, we do this check once per second for 30 seconds (or until we have all data). When data is missing, it is typically one or the other (object tree or geometry), but it varies as to which is missing. When this once-per-second check is done for missing data, the results vary:

* We sometimes get the remaining data within the 30 seconds
* Sometimes the events eventually fire several minutes later (up to 5 minutes later in our testing)
* Sometimes the events never fire

## Reproducing the Issue

### Prerequisites

* A Forge application with **Data Management API** and **Model Derivative API** APIs enabled
* An zipped Inventor assembly to use for creating SVFs
* A token server that can accept requests from the web app and return a Forge token with sufficient permissions to read viewables (`viewables:read` scope)
    * There is a `TokenServer` project in this repo built with .NET 6 that can be used for this. The [.NET 6 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/6.0) is needed in order to run this project
* A web server to serve the web application
    * The [dotnet-serve](https://www.nuget.org/packages/dotnet-serve/) .NET global tool is an easy way to do this, but any web server will work

### Steps to Reproduce

* Upload the zipped Inventor assembly to Forge OSS multiple times (start with 3). For each upload:
    * Copy the zip file and give the new copy a unique name
    * Upload the file
    * Translate the uploaded file
    * Add the URN to the `urns` array in `web-app\assets\js\some_components.js`

* Start the token server
    * If using the included TokenServer project:
        * Set values in `TokenServer\src\TokenServer\appsettings.json` for `AuthRequest:ClientID` and `AuthRequest:ClientSecret` to point to your Forge application
        * Open Powershell/cmd window and navigate to `TokenServer\src\TokenServer`
        * Run `dotnet run`

* Start the web app:
    * If using the [dotnet-serve](https://www.nuget.org/packages/dotnet-serve/) .NET global tool:
        * Set the URL for your token server at the top of `web-app\assets\js\app.js` (note that it is already configured correctly if using the included TokenServer project):

        ```javascript
        let tokenFetchingUrl = "http://localhost:5296/token";
        ```
        
        * Run `dotnet serve` (note that the URL for your running web app will be displayed after running this command)

* Navigate to the running web app
* Open browser dev tools to view the loading progress and handling of expected events being logged to the console
* If the issue is not reproduced, upload another copy of your assembly zip, translate it, and add the new URN to the **beginning** of the `urns` array in `web-app\assets\js\some_components.js`
