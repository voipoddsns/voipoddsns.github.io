(function(){
"use strict";

Lampa.SettingsApi.addParam({
    component:"interface",
    param:{name:"logo_glav",type:"select",values:{1:"Приховати",0:"Відображати"},default:"0"},
    field:{name:"Логотипи замість назв",description:"Відображає логотипи фільмів замість тексту"}
});

Lampa.SettingsApi.addParam({
    component:"interface",
    param:{name:"logo_lang",type:"select",
        values:{"":"Як в Lampa",ru:"Русский",en:"English",uk:"Українська",be:"Беларуская",kz:"Қазақша",pt:"Português",es:"Español",fr:"Français",de:"Deutsch",it:"Italiano"},
        default:""
    },
    field:{name:"Мова логотипу",description:"Пріоритетна мова для пошуку логотипу"}
});

Lampa.SettingsApi.addParam({
    component:"interface",
    param:{name:"logo_size",type:"select",values:{w300:"w300",w500:"w500",w780:"w780",original:"Оригінал"},default:"original"},
    field:{name:"Розмір логотипу",description:"Роздільна здатність зображення, що завантажується"}
});

Lampa.SettingsApi.addParam({
    component:"interface",
    param:{name:"logo_animation_type",type:"select",values:{js:"JavaScript",css:"CSS"},default:"css"},
    field:{name:"Тип анімації логотипів",description:"Спосіб анімації логотипів"}
});

Lampa.SettingsApi.addParam({
    component:"interface",
    param:{name:"logo_hide_year",type:"trigger",default:true},
    field:{name:"Приховувати рік та країну",description:"Приховувати інформацію над логотипом"}
});

Lampa.SettingsApi.addParam({
    component:"interface",
    param:{name:"logo_use_text_height",type:"trigger",default:false},
    field:{name:"Логотип за висотою тексту",description:"Розмір логотипа відповідає висоті тексту"}
});

Lampa.SettingsApi.addParam({
    component:"interface",
    param:{name:"logo_clear_cache",type:"button"},
    field:{name:"Скинути кеш логотипів",description:"Натисніть, щоб очистити кеш зображень"},
    onChange:function(){
        Lampa.Select.show({
            title:"Скинути кеш?",
            items:[{title:"Так",confirm:true},{title:"Ні"}],
            onSelect:function(e){
                if(e.confirm){
                    let del=[];
                    for(let i=0;i<localStorage.length;i++){
                        let key=localStorage.key(i);
                        if(key.indexOf("logo_cache_width_based_v1_")!==-1) del.push(key);
                    }
                    del.forEach(k=>localStorage.removeItem(k));
                    window.location.reload();
                } else Lampa.Controller.toggle("settings_component");
            },
            onBack:function(){ Lampa.Controller.toggle("settings_component"); }
        })
    }
});

if(!window.logoplugin){
window.logoplugin = true;

function applyLogo(img, titleBlock, hasTagline, textHeight){
    img.style.marginTop="0";
    img.style.marginLeft="0";
    img.style.paddingTop = (Lampa.Storage.get("logo_hide_year",true)?0:0.3)+"em";

    let bottomPad = window.innerWidth<768 && hasTagline ? 0.5 : 0.2;
    img.style.paddingBottom = bottomPad+"em";

    if(Lampa.Storage.get("logo_use_text_height",false) && textHeight){
        img.style.height=textHeight+"px";
        img.style.width="auto";
        img.style.maxWidth="100%";
        img.style.maxHeight="none";
     } else if(window.innerWidth<768){
        img.style.width="15em"; // Змінено зі 100% на фіксовану, меншу ширину
        img.style.height="auto";
    } else {
        img.style.width="7em";
        img.style.height="auto";
    }

    img.style.objectFit="contain";
    img.style.objectPosition="left bottom";
    img.style.display="block";
    img.style.opacity="1";

    if(titleBlock){
        titleBlock.empty().append(img);
    }
}

Lampa.Listener.follow("full",function(ev){
    if(ev.type!=="complite") return;
    if(Lampa.Storage.get("logo_glav") === "1") return;

    let card=ev.data.movie;
    let type=card.name ? "tv" : "movie";
    let block=ev.object.activity.render().find(".full-start-new__title");
    let head=ev.object.activity.render().find(".full-start-new__head");
    let details=ev.object.activity.render().find(".full-start-new__details");
    let taglineBlock=ev.object.activity.render().find(".full-start-new__tagline");

    let hasTagline = taglineBlock.length>0 && taglineBlock.text().trim()!=="";
    let titleElem = block[0];

    let lang = Lampa.Storage.get("logo_lang","") || Lampa.Storage.get("language");
    let size = Lampa.Storage.get("logo_size","original");

    let cacheKey = "logo_cache_width_based_v1_"+type+"_"+card.id+"_"+lang;
    let cached = Lampa.Storage.get(cacheKey);

    let textHeight = titleElem ? titleElem.getBoundingClientRect().height : 0;

    function moveHeadWithoutAnimation(){
        if(Lampa.Storage.get("logo_hide_year",true)){
            if(head.length && details.length && details.find(".logo-moved-head").length===0){
                let h = head.html();
                if(h){
                    let h1 = $('<span class="logo-moved-head">'+h+'</span>');
                    let dot = $('<span class="full-start-new__split logo-moved-separator">●</span>');
                    details.append(dot).append(h1);
                    head.css("opacity","0");
                }
            }
        }
    }

    if(cached && cached!=="none"){
        let img=new Image();
        img.src=cached;
        applyLogo(img, block, hasTagline, textHeight);
        moveHeadWithoutAnimation();
        return;
    }

    if(!card.id) return;

    let url = Lampa.TMDB.api(type+"/"+card.id+"/images?api_key="+Lampa.TMDB.key()+"&include_image_language="+lang+",en,null");

    $.get(url,function(data){
        let file=null;

        if(data.logos && data.logos.length>0){
            for(let i=0;i<data.logos.length;i++){
                if(data.logos[i].iso_639_1==lang){
                    file=data.logos[i].file_path;
                    break;
                }
            }
            if(!file){
                for(let i=0;i<data.logos.length;i++){
                    if(data.logos[i].iso_639_1=="en"){
                        file=data.logos[i].file_path;
                        break;
                    }
                }
            }
            if(!file) file = data.logos[0].file_path;
        }

        if(!file){
            Lampa.Storage.set(cacheKey,"none");
            return;
        }

        let src = Lampa.TMDB.image("/t/p/"+size+file.replace(".svg",".png"));
        Lampa.Storage.set(cacheKey, src);

        let img=new Image();
        img.src=src;
        img.onload=function(){
            applyLogo(img, block, hasTagline, textHeight);
            moveHeadWithoutAnimation();
        };
        img.onerror=function(){
            Lampa.Storage.set(cacheKey,"none");
        };

    });

});
}
})();
