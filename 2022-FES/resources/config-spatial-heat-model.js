// Define a new instance of the FES
var fes

S(document).ready(function(){

	fes = new FES({
		// Some basic default options
		"options": {
			"scenario": "Leading the Way",
			"view": "LAD",
			"key": (new Date()).getFullYear()+'',
			"parameter": "stock_ASHP",
			"scale": "relative",
			"years": {"min":2020, "max":2050},
			"map": {
				"bounds": [[49.8273,-6.4874],[59.4227,1.9336]],
				"attribution": "Vis: National Grid ESO"
			},
			"files": {
				"scenarios": "data/scenarios/index-spatial-heat-model.json",
				"parameters": "data/scenarios/parameters-spatial-heat-model.json"
			}
		},
		// How we map from our source data's IDs to a particular geography
		"mapping": {
			"lad": {
				// No mapping needed for LADs
				"LADlayer": { }
			}
		},
		// Define our layers so that they can be used in the views
		"layers": {
			"LADlayer":{
				"geojson":"data/maps/Local_Authority_Districts_(December_2019)_Boundaries_UK_BUC.min.geojson",	// The GeoJSON file with the non-overlapping LAD features
				"key": "lad19cd",	// The key used in the properties of the GeoJSON feature
				"name": "lad19nm"
			}
		},
		// Define our map views
		"views":{
			"LAD":{
				"title":"Local Authority Districts",
				"file":"data/maps/Local_Authority_Districts_(December_2019)_Boundaries_UK_BUC.min.geojson",
				"source": "lad",	// "dataBy" in our config.json
				"layers":[{
					"id": "LADlayer",
					"heatmap": true,
					"boundary":{"strokeWidth":0.5}
				}],
				"popup": {
					"text": function(attr){
						var popup,title,dp,value;
						popup = '<h3>%TITLE% (%CODE%)</h3><p>%VALUE%</p>';
						title = (attr.properties.lad19nm||'?');
						code = (attr.properties.lad19cd||'?');
						dp = (typeof attr.parameter.dp==="number" ? attr.parameter.dp : 2);
						value = '<strong>'+attr.parameter.title+' '+this.options.key+':</strong> '+(typeof attr.value==="number" ? (dp==0 ? Math.round(attr.value) : attr.value.toFixed(dp)).toLocaleString()+''+(attr.parameter.units ? '&thinsp;'+attr.parameter.units : '') : '?');
						return popup.replace(/\%VALUE\%/g,value).replace(/\%TITLE\%/g,title).replace(/\%CODE\%/g,code); // Replace values
					}
				}
			}
		},
		"on": {
			"buildMap": function(){
				var el,div,_obj;
				el = document.querySelector('.leaflet-top.leaflet-left');
				if(el){
					// Does the place search exist?
					if(!el.querySelector('.placesearch')){
						div = document.createElement('div');
						div.classList.add('leaflet-control');
						div.classList.add('leaflet-bar');
						div.innerHTML = '<div class="placesearch"><div class="submit" href="#" title="Search" role="button" aria-label="Search"></div><form class="placeform layersearch pop-left" action="search" method="GET" autocomplete="off"><input class="place" id="search" name="place" value="" placeholder="Search for a named area" type="text" /><div class="searchresults" id="searchresults"></div></div></form>';
						el.appendChild(div);
						
						function toggleActive(state){
							e = el.querySelector('.placesearch');
							if(typeof state!=="boolean") state = !e.classList.contains('typing');
							if(state){
								e.classList.add('typing');
								e.querySelector('input.place').focus();
							}else{
								e.classList.remove('typing');
							}
						}
					
						div.querySelector('.submit').addEventListener('click', function(e){ toggleActive(); });

						_obj = this;
						
						// Stop map dragging on the element
						el.addEventListener('mousedown', function(){ _obj.map.dragging.disable(); });
						el.addEventListener('mouseup', function(){ _obj.map.dragging.enable(); });

						// Define a function for scoring how well a string matches
						function getScore(str1,str2,v1,v2,v3){
							var r = 0;
							str1 = str1.toUpperCase();
							str2 = str2.toUpperCase();
							if(str1.indexOf(str2)==0) r += (v1||3);
							if(str1.indexOf(str2)>0) r += (v2||1);
							if(str1==str2) r += (v3||4);
							return r;
						}
						this.search = TypeAhead.init('#search',{
							'items': [],
							'render': function(d){
								// Construct the label shown in the drop down list
								return d['name']+(d['type'] ? ' ('+d['type']+')':'');
							},
							'rank': function(d,str){
								// Calculate the weight to add to this airport
								var r = 0;
								if(d['name']) r += getScore(d['name'],str);
								if(d['id']) r += getScore(d['name'],str);
								return r;
							},
							'process': function(d){
								// Format the result
								var l,ly,key,i;
								l = d['layer'];
								ly = _obj.layers[l].layer;
								key = _obj.layers[l].key;
								for(i in ly._layers){
									if(ly._layers[i].feature.properties[key]==d['id']){

										// Zoom to feature
										_obj.map.fitBounds(ly._layers[i]._bounds,{'padding':[5,5]});

										// Open the popup for this feature
										ly.getLayer(i).openPopup();
										
										// Change active state
										toggleActive(false);
									}
								}
							}
						});
					}
					if(this.search){
						var l,f,i,j;
						this.search._added = {};
						this.search.clearItems();
						for(j = 0; j < this.views[this.options.view].layers.length; j++){
							l = this.views[this.options.view].layers[j].id;
							key = "";
							if(l=="LADlayer") key = "lad19nm";
							if(this.layers[l].geojson && this.layers[l].geojson.features && this.layers[l].key && key){
								// If we haven't already processed this layer we do so now
								if(!this.search._added[l]){
									f = this.layers[l].geojson.features;
									for(i = 0; i < f.length; i++) this.search.addItems({'name':f[i].properties[key]||"?",'id':f[i].properties[this.layers[l].key]||"",'i':i,'layer':l});
									this.search._added[l] = true;
								}
							}
						}
					}
				}
			}
		}
	});

	// Add download button
	if(S('#download-csv')){
		S('#download-csv').on('click',{me:fes},function(e){
			e.preventDefault();
			e.stopPropagation();
			var csv = "";
			var opt = e.data.me.options;
			var filename = ("FES-2021--{{scenario}}--{{parameter}}--{{view}}.csv").replace(/\{\{([^\}]+)\}\}/g,function(m,p1){ return (opt[p1]||"").replace(/[ ]/g,"_") });
			var values,r,rs,y,v,l,layerid,p,ky,nm;
			values = e.data.me.data.scenarios[e.data.me.options.scenario].data[e.data.me.options.parameter].layers[e.data.me.options.view].values;
			v = e.data.me.options.view;
			layerid = '';
			// We need to loop over the view's layers
			for(l = 0; l < e.data.me.views[v].layers.length; l++){
				if(e.data.me.views[v].layers[l].heatmap) layerid = l;
			}
			ky = e.data.me.layers[e.data.me.views[v].layers[layerid].id].key;
			nm = e.data.me.layers[e.data.me.views[v].layers[layerid].id].name;

			rs = Object.keys(values).sort();
			csv = ky.toUpperCase()+','+e.data.me.views[v].title;
			for(y = e.data.me.options.years.min; y <= e.data.me.options.years.max; y+=5) csv += ','+y+(e.data.me.parameters[e.data.me.options.parameter] && e.data.me.parameters[e.data.me.options.parameter].units ? ' ('+e.data.me.parameters[e.data.me.options.parameter].units+')' : '');
			csv += '\n';
			for(i = 0; i < rs.length; i++){
				r = rs[i];
				p = getGeoJSONPropertiesByKeyValue(e.data.me.layers[e.data.me.views[v].layers[layerid].id].geojson,ky,r);
				csv += r;
				csv += ','+(p[nm].match(',') ? '"'+p[nm]+'"' : p[nm]);
				for(y = e.data.me.options.years.min; y <= e.data.me.options.years.max; y+=5) csv += ','+(typeof e.data.me.parameters[e.data.me.options.parameter].dp==="number" ? values[r][y].toFixed(e.data.me.parameters[e.data.me.options.parameter].dp) : values[r][y]);
				csv += '\n'
			}
			saveToFile(csv,filename,'text/plain');
		});
	}
	function getGeoJSONPropertiesByKeyValue(geojson,key,value){
		if(!geojson.features || typeof geojson.features!=="object"){
			fes.log('WARNING','Invalid GeoJSON',geojson);
			return {};
		}
		for(var i = 0; i < geojson.features.length; i++){
			if(geojson.features[i].properties[key] == value) return geojson.features[i].properties;
		}
		return {};
	};
	function getGeoJSONPropertyValue(l,value){
		if(!fes.layers[l].key){
			fes.log('WARNING','No key set for layer '+l);
			return "";
		}
		if(fes.layers[l] && fes.layers[l].geojson){
			key = (fes.layers[l].name||fes.layers[l].key);
			for(var i = 0; i < fes.layers[l].geojson.features.length; i++){
				if(fes.layers[l].geojson.features[i].properties[fes.layers[l].key] == value) return fes.layers[l].geojson.features[i].properties[key];
			}
			return "";
		}else return "";
	};
	function saveToFile(txt,fileNameToSaveAs,mime){
		// Bail out if there is no Blob function
		if(typeof Blob!=="function") return this;

		var textFileAsBlob = new Blob([txt], {type:(mime||'text/plain')});

		function destroyClickedElement(event){ document.body.removeChild(event.target); }

		var dl = document.createElement("a");
		dl.download = fileNameToSaveAs;
		dl.innerHTML = "Download File";

		if(window.webkitURL != null){
			// Chrome allows the link to be clicked without actually adding it to the DOM.
			dl.href = window.webkitURL.createObjectURL(textFileAsBlob);
		}else{
			// Firefox requires the link to be added to the DOM before it can be clicked.
			dl.href = window.URL.createObjectURL(textFileAsBlob);
			dl.onclick = destroyClickedElement;
			dl.style.display = "none";
			document.body.appendChild(dl);
		}
		dl.click();
	}

});
