# sharp-resizer-server
> an automatic node-based image resizer server, with frontend-friendly API

## Install and Run
1. `git clone git@github.com:scaccogatto/sharp-resizer-server.git`
2. `cd sharp-resizer-server`
3. `npm install`
4. `npm run start`

## Start resizing
- After installation, everytime you add a new folder inside `input`, a **watcher** will be started, listening to any change
- The folder's name should be a `Number` and it will be treated as a `px` value multiplied for `19.20` by default and scaled downwards the other folders inside `input`
- Add images inside your preferred folder and the server will scale downwards automatically
- Open a browser and call `localhost:4080/images/json`

## Output
The API entry point (`images/json`) will output a JSON file ready for your frontend usage.
The output format is:
```
{
  "bigImage.jpg": {
    "sizes": "100w",
    "srcset": "/images/output/100/bigImage.jpg 100w, /images/output/72/bigImage.jpg 72w, /images/output/37/bigImage.jpg 37w, /images/output/26/bigImage.jpg 26w, /images/output/16/bigImage.jpg 16w",
    "src": "/images/output/100/bigImage.jpg"
  },
  "mediumImage.jpg": {
    "sizes": "37w",
    "srcset": "/images/output/37/mediumImage.jpg 37w, /images/output/26/mediumImage.jpg 26w, /images/output/16/mediumImage.jpg 16w",
    "src": "/images/output/37/mediumImage.jpg"
  },
}
```
An `Object` containing images' names as keys and every key is an `Object` containing:
- `sizes`: the greatest width found for that file
- `srcset`: a string for `<picture>` TAGs, ready for use
- `src`: for image fallback
## Example
Tree:
```
input
--| 100
--| 72
--| 37
--| 26
--| 16

output
--| 100
--| 72
--| 37
--| 26
--| 16
```
Add an image into `100` folder
```
input
--| 100
  | -- bigImage.png
--| 72
--| 37
--| 26
--| 16

output
--| 100
  | -- bigImage.png
--| 72
  | -- bigImage.png
--| 37
  | -- bigImage.png
--| 26
  | -- bigImage.png
--| 16
  | -- bigImage.png
```
Add an image into `37` folder
```
input
--| 100
  | -- bigImage.png
--| 72
--| 37
  | -- mediumImage.png
--| 26
--| 16

output
--| 100
  | -- bigImage.png
--| 72
  | -- bigImage.png
--| 37
  | -- bigImage.png
  | -- mediumImage.png
--| 26
  | -- bigImage.png
  | -- mediumImage.png
--| 16
  | -- bigImage.png
  | -- mediumImage.png  
```
Let's print the **bigImage** then, **after** reading things from API:
```
<picture>
  <source sizes="100w" srcset="/images/output/100/bigImage.jpg 100w, /images/output/72/bigImage.jpg 72w, /images/output/37/bigImage.jpg 37w, /images/output/26/bigImage.jpg 26w, /images/output/16/bigImage.jpg 16w",
    "src": "/images/output/100/bigImage.jpg" />
  <img src="/images/output/100/bigImage.jpg" />
</picture>
```

## Advanced
### Script parameters
You can also specify some script parameters such as:
- `-i` input directory
- `-o` output directory
- `-m` pixel multipllier (when `m = 1920` folder `100` -> `1920px`)
- `-t` maximum concurrent conversion threads
- `-p` API local server port
- `-e` API entry point

### Defaults
`node index.js -i input -o output -m 1920 -t 1 -p 4080 -e images`
